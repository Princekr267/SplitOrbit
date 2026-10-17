import { Router } from 'express';
import {
  createExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
} from '../controllers/expenseController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireGroupHost, requireGroupAccess } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseParamsSchema,
} from '../validations/expenseValidation.js';
import { groupIdParamSchema } from '../validations/groupValidation.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post('/', requireGroupHost, validate(createExpenseSchema), createExpense);
router.get('/', validate(groupIdParamSchema), requireGroupAccess, getExpenses);
router.patch('/:expenseId', requireGroupHost, validate(updateExpenseSchema), updateExpense);
router.delete('/:expenseId', requireGroupHost, validate(expenseParamsSchema), deleteExpense);

export default router;
