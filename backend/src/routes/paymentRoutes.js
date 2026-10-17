import { Router } from 'express';
import {
  createPayment,
  getPayments,
  getPendingPayments,
  acceptPayment,
  rejectPayment,
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireGroupHost, requireGroupAccess } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createHostPaymentSchema,
  paymentParamsSchema,
} from '../validations/paymentValidation.js';
import { groupIdParamSchema } from '../validations/groupValidation.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

// Host can record payment for anyone; Friend can submit pending payment for self
router.post('/', validate(createHostPaymentSchema), createPayment);
router.get('/', validate(groupIdParamSchema), requireGroupAccess, getPayments);

// Host Pending Payments Inbox
router.get('/pending', requireGroupHost, validate(groupIdParamSchema), getPendingPayments);
router.post('/:paymentId/accept', requireGroupHost, validate(paymentParamsSchema), acceptPayment);
router.post('/:paymentId/reject', requireGroupHost, validate(paymentParamsSchema), rejectPayment);

export default router;
