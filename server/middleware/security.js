import rateLimit     from 'express-rate-limit';
import helmet        from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { verifyAccessToken } from '../services/tokenService.js';
import { sanitizeObject }    from '../utils/validation.js';
import logger                from '../utils/logger.js';

// ── 1. Security Headers ───────────────────────────────────────────────────────
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      mediaSrc:    ["'none'"],
      frameSrc:    ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
    preload:           true,
  },
  noSniff:        true,
  frameguard:     { action: 'deny' },
  xssFilter:      true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
});

// ── 2. Rate Limiters ──────────────────────────────────────────────────────────

// General auth endpoints (login, reset password) — 10 per 15 minutes
export const authRateLimit = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded on auth endpoint', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

// Registration specifically — 3 per hour per IP
// Legitimate users only ever register once so 3 is generous
export const registrationRateLimit = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             3,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many accounts created from this IP. Please try again later.' },
  handler: (req, res, next, options) => {
    logger.warn('Registration rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

// General API — 100 requests per minute
export const apiRateLimit = rateLimit({
  windowMs:        60 * 1000,
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please slow down.' },
});

// AI Advisor — 10 per minute (expensive operation)
export const advisorRateLimit = rateLimit({
  windowMs:        60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many advisor requests. Please wait a moment.' },
});

// ── 3. JWT Authentication ─────────────────────────────────────────────────────
export const authenticate = (req, res, next) => {
  try {
    const token = req.cookies?.access_token;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const payload = verifyAccessToken(token);
    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    req.userId = payload.sub;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    logger.warn('Invalid token presented', { ip: req.ip, error: err.message });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ── 4. NoSQL Injection Prevention ─────────────────────────────────────────────
export const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn('Potential NoSQL injection attempt sanitized', { ip: req.ip, key });
  },
});

// ── 5. XSS Sanitization ───────────────────────────────────────────────────────
export const sanitizeRequest = (req, res, next) => {
  if (req.body)   req.body   = sanitizeObject(req.body);
  if (req.query)  req.query  = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
};

// ── 6. User Isolation ─────────────────────────────────────────────────────────
export const requireOwnership = (userIdField = 'userId') => (req, res, next) => {
  const paramUserId = req.query[userIdField] || req.body[userIdField] || req.params[userIdField];
  if (paramUserId && paramUserId !== req.userId) {
    logger.warn('Unauthorized data access attempt', {
      requestingUser: req.userId,
      targetUser:     paramUserId,
      ip:             req.ip,
      path:           req.path,
    });
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// ── 7. Error Handler ──────────────────────────────────────────────────────────
export const errorHandler = (err, req, res, next) => {
  const isDev  = process.env.NODE_ENV === 'development';
  const status = err.status || err.statusCode || 500;
  const logId  = `ERR-${Date.now()}`;

  logger.error('Request error', {
    logId,
    status,
    message: err.message,
    path:    req.path,
    method:  req.method,
    userId:  req.userId || 'unauthenticated',
    ...(isDev && { stack: err.stack }),
  });

  res.status(status).json({
    error: status < 500 ? err.message : 'An unexpected error occurred',
    logId,
    ...(isDev && { stack: err.stack }),
  });
};

// ── 8. Request Logger ─────────────────────────────────────────────────────────
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request completed', {
      method:   req.method,
      path:     req.path,
      status:   res.statusCode,
      duration: `${Date.now() - start}ms`,
      userId:   req.userId || 'unauthenticated',
      ip:       req.ip,
    });
  });
  next();
};
