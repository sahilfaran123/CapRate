import xss from 'xss';
import { body, param, query, validationResult } from 'express-validator';

/**
 * Sanitize a string against XSS.
 * Used for any user-supplied text before processing.
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return xss(str.trim(), {
    whiteList:       {},   // No HTML tags allowed
    stripIgnoreTag:  true,
    stripIgnoreTagBody: ['script', 'style'],
  });
}

/**
 * Sanitize an entire object recursively.
 */
export function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string')       out[key] = sanitizeString(val);
    else if (typeof val === 'object')  out[key] = sanitizeObject(val);
    else                               out[key] = val;
  }
  return out;
}

/**
 * Express middleware: reject request if validation errors exist.
 * Returns a generic 400 — never leaks field-level details in production.
 */
export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const isDev = process.env.NODE_ENV === 'development';
    return res.status(400).json({
      error:   'Validation failed',
      details: isDev ? errors.array().map(e => ({ field: e.path, msg: e.msg })) : undefined,
    });
  }
  next();
}

// ── Validation chains ──────────────────────────────────────────────────────

export const validateEmail = () =>
  body('email')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail()
    .isLength({ max: 254 });

export const validatePassword = () =>
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
    .matches(/\d/).withMessage('Password must contain a number');

export const validateMongoId = (field = 'id', source = 'param') => {
  const chain = source === 'param' ? param(field) : query(field);
  return chain
    .isMongoId().withMessage('Invalid ID format');
};

export const validateCurrency = (field) =>
  body(field)
    .optional()
    .isFloat({ min: 0, max: 100_000_000 })
    .withMessage(`${field} must be a positive number`);

export const validateInterestRate = () =>
  body('interestRate')
    .optional()
    .isFloat({ min: 0, max: 30 })
    .withMessage('Interest rate must be between 0 and 30');

export const validateLoanTerm = () =>
  body('loanTermYears')
    .optional()
    .isIn([10, 15, 20, 30])
    .withMessage('Loan term must be 10, 15, 20, or 30 years');

export const validateAddress = () =>
  body('address')
    .notEmpty()
    .isLength({ max: 200 })
    .matches(/^[a-zA-Z0-9\s,.\-#]+$/)
    .withMessage('Address contains invalid characters');

export const validateState = () =>
  body('state')
    .isLength({ min: 2, max: 2 })
    .isAlpha()
    .withMessage('State must be a 2-letter code');
