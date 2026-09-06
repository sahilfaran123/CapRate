import express from 'express';
import { authenticate } from '../middleware/security.js';
import {
  getInvestmentAccounts,
  getHoldings,
  getInvestmentTransactions,
} from '../controllers/investmentController.js';

const router = express.Router();

router.use(authenticate);

router.get('/accounts',     getInvestmentAccounts);
router.get('/holdings',     getHoldings);
router.get('/transactions', getInvestmentTransactions);

export default router;
