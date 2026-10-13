import { Router } from 'express';
import { getPublicStatement, claimShareLink } from '../controllers/shareController.js';
import { getPublicShareAnalytics } from '../controllers/analyticsController.js';
import { resolveViewingPerson } from '../middleware/privacyMiddleware.js';
import { publicLinkLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { analyticsQuerySchema } from '../validations/analyticsValidation.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

// Level 1: Public read-only statement
router.get('/:token/analytics', publicLinkLimiter, resolveViewingPerson, validate(analyticsQuerySchema), getPublicShareAnalytics);
router.get('/:token', publicLinkLimiter, resolveViewingPerson, getPublicStatement);

// Claim statement profile using view link
router.post('/:token/claim', authenticate, claimShareLink);

export default router;

