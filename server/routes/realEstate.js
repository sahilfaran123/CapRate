import express from 'express';
import { authenticate } from '../middleware/security.js';
import {
  getProperties,
  addProperty,
  updatePropertyInputs,
  refreshProperty,
  removeProperty,
  addPropertyEvent,
  deletePropertyEvent,
  getPropertyEvents,
  getTaxSummary,
  linkPropertyAccount,
  unlinkPropertyAccount,
  getPropertyFinancials,
} from '../controllers/realEstateController.js';

const router = express.Router();

router.use(authenticate);

router.get('/properties',                    getProperties);
router.post('/add',                          addProperty);
router.get('/tax-summary',                   getTaxSummary);
router.put('/property/:propertyId/inputs',   updatePropertyInputs);
router.post('/property/:propertyId/refresh', refreshProperty);
router.get('/property/:propertyId/events',            getPropertyEvents);
router.post('/property/:propertyId/event',            addPropertyEvent);
router.delete('/property/:propertyId/event/:eventId', deletePropertyEvent);
router.put('/property/:propertyId/link-account',      linkPropertyAccount);
router.delete('/property/:propertyId/link-account',   unlinkPropertyAccount);
router.get('/property/:propertyId/financials',        getPropertyFinancials);
router.delete('/property/:propertyId',       removeProperty);

export default router;
