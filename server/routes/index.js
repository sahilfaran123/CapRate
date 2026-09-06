// ── routes/investments.js ─────────────────────────────────────────────────────
import express from 'express';
import { authenticate } from '../middleware/security.js';
import { getInvestmentAccounts, getHoldings, getInvestmentTransactions } from '../controllers/investmentController.js';

const investmentRouter = express.Router();
investmentRouter.use(authenticate);
investmentRouter.get('/accounts',     getInvestmentAccounts);
investmentRouter.get('/holdings',     getHoldings);
investmentRouter.get('/transactions', getInvestmentTransactions);

export { investmentRouter };

// ── routes/realEstate.js ──────────────────────────────────────────────────────
import { authenticate as auth2 } from '../middleware/security.js';
import {
  validateAddress, validateState, validateCurrency,
  validateInterestRate, validateLoanTerm, handleValidationErrors as hve,
} from '../utils/validation.js';
import { body, param } from 'express-validator';
import {
  getProperties, addProperty, updatePropertyInputs,
  refreshProperty, removeProperty,
} from '../controllers/realEstateController.js';

const realEstateRouter = express.Router();
realEstateRouter.use(auth2);

realEstateRouter.get('/properties', getProperties);

realEstateRouter.post('/add', [
  validateAddress(),
  body('city').notEmpty().isLength({ max: 100 }).trim().matches(/^[a-zA-Z\s\-'.]+$/),
  validateState(),
  body('zipCode').optional().matches(/^\d{5}(-\d{4})?$/),
  hve,
], addProperty);

realEstateRouter.put('/property/:propertyId/inputs', [
  param('propertyId').notEmpty().isLength({ max: 100 }),
  validateCurrency('actualMonthlyRent'),
  validateCurrency('monthlyMortgage'),
  validateCurrency('monthlyHOA'),
  validateCurrency('monthlyInsurance'),
  validateCurrency('monthlyPropertyTax'),
  validateCurrency('monthlyMaintenance'),
  validateCurrency('purchasePrice'),
  validateCurrency('downPayment'),
  validateInterestRate(),
  validateLoanTerm(),
  body('purchaseDate').optional().isISO8601(),
  hve,
], updatePropertyInputs);

realEstateRouter.post('/property/:propertyId/refresh', [
  param('propertyId').notEmpty().isLength({ max: 100 }),
  hve,
], refreshProperty);

realEstateRouter.delete('/property/:propertyId', [
  param('propertyId').notEmpty().isLength({ max: 100 }),
  hve,
], removeProperty);

export { realEstateRouter };

// ── routes/balanceHistory.js ──────────────────────────────────────────────────
import { authenticate as auth3 } from '../middleware/security.js';
import {
  saveBalanceSnapshot, manualSnapshotTrigger,
  getAllBankingHistory, getAllInvestmentHistory,
  getBankingHistory, getInvestmentHistory,
} from '../controllers/balanceHistoryController.js';
import { param as p3, query as q3 } from 'express-validator';
import { handleValidationErrors as hve3 } from '../utils/validation.js';

const balanceHistoryRouter = express.Router();
balanceHistoryRouter.use(auth3);

balanceHistoryRouter.post('/snapshot',        saveBalanceSnapshot);
balanceHistoryRouter.post('/snapshot-manual', manualSnapshotTrigger);
balanceHistoryRouter.get('/banking', [
  q3('days').optional().isInt({ min: 1, max: 730 }),
  hve3,
], getAllBankingHistory);
balanceHistoryRouter.get('/investment', [
  q3('days').optional().isInt({ min: 1, max: 730 }),
  hve3,
], getAllInvestmentHistory);
balanceHistoryRouter.get('/banking/:accountId', [
  p3('accountId').notEmpty().isLength({ max: 100 }),
  hve3,
], getBankingHistory);
balanceHistoryRouter.get('/investment/:accountId', [
  p3('accountId').notEmpty().isLength({ max: 100 }),
  hve3,
], getInvestmentHistory);

export { balanceHistoryRouter };

// ── routes/advisor.js ─────────────────────────────────────────────────────────
import { authenticate as auth4, advisorRateLimit } from '../middleware/security.js';
import {
  chat, getConversations, getConversation, deleteConversation,
} from '../controllers/advisorController.js';
import { body as b4, param as p4 } from 'express-validator';
import { handleValidationErrors as hve4 } from '../utils/validation.js';

const advisorRouter = express.Router();
advisorRouter.use(auth4);
advisorRouter.use(advisorRateLimit);

advisorRouter.post('/chat', [
  b4('message').notEmpty().isLength({ min: 1, max: 4000 }).trim(),
  b4('conversationId').optional().isMongoId(),
  hve4,
], chat);

advisorRouter.get('/conversations', getConversations);
advisorRouter.get('/conversations/:id', [
  p4('id').isMongoId(), hve4,
], getConversation);
advisorRouter.delete('/conversations/:id', [
  p4('id').isMongoId(), hve4,
], deleteConversation);

export { advisorRouter };
