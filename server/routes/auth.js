import express from 'express';
import {
  register, login, refresh, logout,
  requestPasswordReset, resetPassword,
  getMe, deleteAccount,
} from '../controllers/authController.js';
import { authenticate, authRateLimit, registrationRateLimit } from '../middleware/security.js';
import { body } from 'express-validator';
import { validateEmail, validatePassword, handleValidationErrors } from '../utils/validation.js';

const router = express.Router();
router.use(authRateLimit);

router.post('/register', [
  registrationRateLimit,
  validateEmail(),
  validatePassword(),
  body('name').optional().isLength({ max: 200 }).trim(),
  handleValidationErrors,
], register);

router.post('/login', [
  validateEmail(),
  body('password').notEmpty().isLength({ max: 128 }),
  handleValidationErrors,
], login);

router.post('/refresh',        refresh);
router.post('/logout',         logout);
router.post('/request-reset',  requestPasswordReset);

router.post('/reset-password', [
  validateEmail(),
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/\d/).withMessage('Password must contain a number'),
  handleValidationErrors,
], resetPassword);

router.get('/me',      authenticate, getMe);

// Delete account — requires password confirmation for safety
router.delete('/account', authenticate, deleteAccount);

export default router;
