import { Router } from 'express';
import {
  getSystemStats,
  getUsers,
  getUserDetail,
  toggleUserStatus,
  changeUserRole,
  forceSignOutUser,
  updateUserDisplayName,
  getAdminGroups,
  getAdminGroupLedger,
  freezeGroup,
  unfreezeGroup,
  reopenGroupAdmin,
  restoreGroupAdmin,
  transferGroupHost,
  getAdminSettings,
  updateAdminSettings,
  getAuditLogs,
  getResetRequests,
  dismissResetRequest,
  generateResetCredential,
  impersonateUser,
  runIntegrity,
  getIntegrityReport,
  getAdminShareLinks,
  revokeShareLink,
  revokeGroupShareLinks,
  getAdminExpenses,
  getAdminPayments,
  overrideExpense,
  overridePayment,
  exportEntity,
} from '../controllers/adminController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import { adminAnalyticsQuerySchema } from '../validations/analyticsValidation.js';
import { getAdminAnalytics } from '../controllers/analyticsController.js';

const router = Router();

// Guard all admin routes: authenticate -> requireAdmin (re-reads role & isActive from DB)
router.use(authenticate, requireAdmin);

// Overview / stats & analytics
router.get('/stats', getSystemStats);
router.get('/analytics', validate(adminAnalyticsQuerySchema), getAdminAnalytics);


// Users management
router.get('/users', getUsers);
router.get('/users/:userId', getUserDetail);
router.patch('/users/:userId/status', toggleUserStatus);
router.patch('/users/:userId/role', changeUserRole);
router.post('/users/:userId/force-sign-out', forceSignOutUser);
router.post('/users/:userId/impersonate', impersonateUser);
router.patch('/users/:userId/name', updateUserDisplayName);
router.post('/users/:id/reset-credential', generateResetCredential);

// Groups management
router.get('/groups', getAdminGroups);
router.get('/groups/:groupId', getAdminGroupLedger);
router.post('/groups/:groupId/freeze', freezeGroup);
router.post('/groups/:groupId/unfreeze', unfreezeGroup);
router.post('/groups/:groupId/reopen', reopenGroupAdmin);
router.post('/groups/:groupId/restore', restoreGroupAdmin);
router.post('/groups/:groupId/transfer-host', transferGroupHost);

// Expenses & Payments oversight
router.get('/expenses', getAdminExpenses);
router.post('/expenses/:id/override', overrideExpense);
router.get('/payments', getAdminPayments);
router.post('/payments/:id/override', overridePayment);

// Share links & invites oversight
router.get('/share-links', getAdminShareLinks);
router.post('/share-links/:personId/revoke', revokeShareLink);
router.post('/share-links/group/:groupId/revoke-all', revokeGroupShareLinks);

// Data integrity checker
router.get('/integrity', getIntegrityReport);
router.post('/integrity/run', runIntegrity);

// System settings
router.get('/settings', getAdminSettings);
router.put('/settings', updateAdminSettings);
router.patch('/settings', updateAdminSettings);

// Reset requests queue
router.get('/reset-requests', getResetRequests);
router.post('/reset-requests/:id/dismiss', dismissResetRequest);

// Audit logs
router.get('/audit-logs', getAuditLogs);

// CSV Export
router.post('/export/:entity', exportEntity);

export default router;
