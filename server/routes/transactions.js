import express from 'express';
import { authenticate } from '../middleware/security.js';
import {
  listTransactions,
  assignTransaction,
  assignTransactionsBulk,
  createRule,
  deleteRule,
  deleteOverride,
} from '../controllers/transactionsController.js';

const router = express.Router();

router.use(authenticate);

router.get('/',            listTransactions);
router.post('/assign',     assignTransaction);
router.post('/assign-bulk', assignTransactionsBulk);
router.post('/rule',       createRule);
router.delete('/rule/:ruleId', deleteRule);
router.delete('/override', deleteOverride);

export default router;
