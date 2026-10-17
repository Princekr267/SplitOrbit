import { Router } from 'express';
import {
  addPerson,
  getPeople,
  updatePerson,
  deletePerson,
  generateShareLink,
  revokeShareLink,
  getPersonStatement,
  updatePersonPermissions,
  bulkSetViewAllBills,
} from '../controllers/personController.js';
import { generateInviteCode } from '../controllers/inviteController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireGroupHost, requireGroupAccess } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  addPersonSchema,
  updatePersonSchema,
  personParamsSchema,
  personPermissionsSchema,
  bulkViewAllSchema,
} from '../validations/personValidation.js';
import { groupIdParamSchema } from '../validations/groupValidation.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post('/', requireGroupHost, validate(addPersonSchema), addPerson);
router.get('/', validate(groupIdParamSchema), requireGroupAccess, getPeople);
router.patch('/:personId', requireGroupHost, validate(updatePersonSchema), updatePerson);
router.delete('/:personId', requireGroupHost, validate(personParamsSchema), deletePerson);

// Share view link (Level 1)
router.post('/:personId/share-link', requireGroupHost, validate(personParamsSchema), generateShareLink);
router.delete('/:personId/share-link', requireGroupHost, validate(personParamsSchema), revokeShareLink);

// Invite claim link (Level 2)
router.post('/:personId/invite', requireGroupHost, validate(personParamsSchema), generateInviteCode);

// Person itemized statement
router.get('/:personId/statement', validate(personParamsSchema), requireGroupAccess, getPersonStatement);

// Bill visibility permission (host only)
router.patch('/:personId/permissions', requireGroupHost, validate(personPermissionsSchema), updatePersonPermissions);

export default router;
