// ── routes/plaid.js ───────────────────────────────────────────────────────────
import express       from 'express';
import { authenticate, requireOwnership } from '../middleware/security.js';
import { body, param } from 'express-validator';
import { handleValidationErrors } from '../utils/validation.js';
import {
  createLinkToken, exchangePublicToken,
  getAccounts, getTransactions, removeItem,
} from '../controllers/plaidController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.post('/link-token',            createLinkToken);
router.post('/exchange-public-token', [
  body('publicToken').notEmpty().isLength({ max: 500 }),
  body('institutionName').optional().isLength({ max: 200 }).trim(),
  handleValidationErrors,
], exchangePublicToken);
router.get('/accounts',               getAccounts);
router.get('/transactions',           getTransactions);
router.delete('/item/:itemId', [
  param('itemId').notEmpty().isLength({ max: 100 }).matches(/^[a-zA-Z0-9_-]+$/),
  handleValidationErrors,
], removeItem);

export default router;
