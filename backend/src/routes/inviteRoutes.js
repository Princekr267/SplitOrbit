import { Router } from 'express';
import {
  previewInviteCode,
  getInviteDetails,
  claimInviteCode,
} from '../controllers/inviteController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { publicLinkLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public preview endpoint (rate-limited, returns valid/invalid reason without leaking data)
router.get('/:code/preview', publicLinkLimiter, previewInviteCode);

// Inspect invite code (backward compatibility)
router.get('/:code', publicLinkLimiter, getInviteDetails);

// Claim invite code (requires user authentication, idempotent, row-locked)
router.post('/:code/claim', authenticate, claimInviteCode);
router.post('/:code/accept', authenticate, claimInviteCode);

export default router;

