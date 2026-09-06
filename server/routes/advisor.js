import express from 'express';
import { authenticate, advisorRateLimit } from '../middleware/security.js';
import {
  chat,
  getConversations,
  getConversation,
  deleteConversation,
} from '../controllers/advisorController.js';

const router = express.Router();

router.use(authenticate);
router.use(advisorRateLimit);

router.post('/chat',                    chat);
router.get('/conversations',            getConversations);
router.get('/conversations/:id',        getConversation);
router.delete('/conversations/:id',     deleteConversation);

export default router;
