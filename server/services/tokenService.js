import jwt     from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import logger  from '../utils/logger.js';

const ACCESS_TOKEN_EXPIRY  = '15m';   // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '7d';    // Longer-lived refresh token

function getAccessSecret() {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_ACCESS_SECRET missing or too short');
  return s;
}

function getRefreshSecret() {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_REFRESH_SECRET missing or too short');
  return s;
}

/**
 * Issue an access token (15 min) and refresh token (7 days).
 * Tokens contain only non-sensitive claims (userId, jti).
 */
export function issueTokens(userId) {
  const jti         = uuidv4(); // Unique token ID for revocation
  const accessToken = jwt.sign(
    { sub: userId, jti, type: 'access' },
    getAccessSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: 'HS256' }
  );
  const refreshToken = jwt.sign(
    { sub: userId, jti, type: 'refresh' },
    getRefreshSecret(),
    { expiresIn: REFRESH_TOKEN_EXPIRY, algorithm: 'HS256' }
  );
  return { accessToken, refreshToken };
}

/**
 * Verify an access token. Returns payload or throws.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, getAccessSecret(), { algorithms: ['HS256'] });
}

/**
 * Verify a refresh token. Returns payload or throws.
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshSecret(), { algorithms: ['HS256'] });
}

/**
 * Set tokens as HTTP-only, Secure, SameSite cookies.
 * NEVER stored in localStorage.
 */
export function setTokenCookies(res, accessToken, refreshToken) {
  const isProd   = process.env.NODE_ENV === 'production';
  const baseOpts = {
    httpOnly: true,               // Not accessible to JavaScript
    secure:   isProd,             // HTTPS only in production
    sameSite: 'strict',           // CSRF protection
    path:     '/',
  };

  res.cookie('access_token', accessToken, {
    ...baseOpts,
    maxAge: 15 * 60 * 1000,       // 15 minutes in ms
  });

  res.cookie('refresh_token', refreshToken, {
    ...baseOpts,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path:   '/api/auth/refresh',       // Refresh token only sent to refresh endpoint
  });
}

/**
 * Clear auth cookies on logout.
 */
export function clearTokenCookies(res) {
  res.clearCookie('access_token',  { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
}
