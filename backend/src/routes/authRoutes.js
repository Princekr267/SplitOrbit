import { Router } from 'express';
import {
  register,
  login,
  logout,
  me,
  exitImpersonation,
  dismissPasswordNotice,
  checkUsernameAvailable,
  recoverWithCode,
  submitResetRequest,
  validateResetToken,
  resetPassword,
} from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  registerSchema,
  loginSchema,
  recoverSchema,
  resetRequestSchema,
  resetPasswordSchema,
} from '../validations/authValidation.js';

const router = Router();

// Registration & Username availability
router.get('/username-available', checkUsernameAvailable);
router.get('/check-username', checkUsernameAvailable);
router.post('/register', validate(registerSchema), register);

// Login & Logout
router.post('/login', validate(loginSchema), login);
router.post('/logout', authenticate, logout);
router.post('/exit-impersonation', authenticate, exitImpersonation);
router.post('/stop-impersonation', authenticate, exitImpersonation);

// Recovery code redemption
router.post('/recover', validate(recoverSchema), recoverWithCode);
router.post('/recover-with-code', validate(recoverSchema), recoverWithCode);

// Reset requests to admin
router.post('/reset-requests', validate(resetRequestSchema), submitResetRequest);
router.post('/request-reset', validate(resetRequestSchema), submitResetRequest);

// Reset password via admin token or short code
router.get('/reset-password/validate', validateResetToken);
router.get('/validate-reset-token', validateResetToken);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);

// User profile & notice dismissal
router.get('/me', authenticate, me);
router.post('/password-notice/dismiss', authenticate, dismissPasswordNotice);
router.post('/me/dismiss-password-notice', authenticate, dismissPasswordNotice);

export default router;
