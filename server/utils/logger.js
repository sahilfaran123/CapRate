import { createLogger, format, transports } from 'winston';

// Fields that must NEVER appear in logs
const REDACTED_FIELDS = [
  'password', 'token', 'accessToken', 'refreshToken', 'secret',
  'apiKey', 'authorization', 'cookie', 'ssn', 'creditCard',
  'accountNumber', 'routingNumber', 'plaidSecret', 'anthropicKey',
];

/**
 * Deep-redact sensitive fields from any object before logging.
 */
function redact(obj, depth = 0) {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [key, val] of Object.entries(obj)) {
    if (REDACTED_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      out[key] = '[REDACTED]';
    } else if (typeof val === 'object') {
      out[key] = redact(val, depth + 1);
    } else {
      out[key] = val;
    }
  }
  return out;
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: false }), // Never log stack traces to output
    format.printf(({ timestamp, level, message, ...meta }) => {
      const safeMeta = redact(meta);
      return JSON.stringify({ timestamp, level, message, ...safeMeta });
    })
  ),
  transports: [
    new transports.Console(),
    // In production add file/cloud transport here
  ],
});

export default logger;
