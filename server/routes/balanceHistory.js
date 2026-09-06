import express from 'express';
import { authenticate } from '../middleware/security.js';
import {
  saveBalanceSnapshot,
  manualSnapshotTrigger,
  getAllBankingHistory,
  getAllInvestmentHistory,
  getBankingHistory,
  getInvestmentHistory,
} from '../controllers/balanceHistoryController.js';

const router = express.Router();

router.use(authenticate);

router.post('/snapshot',              saveBalanceSnapshot);
router.post('/snapshot-manual',       manualSnapshotTrigger);
router.get('/banking',                getAllBankingHistory);
router.get('/investment',             getAllInvestmentHistory);
router.get('/banking/:accountId',     getBankingHistory);
router.get('/investment/:accountId',  getInvestmentHistory);

export default router;
