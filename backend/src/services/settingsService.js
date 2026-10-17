import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../config/db.js';
import { systemSettings, users } from '../models/index.js';
import { recordAuditLog } from './auditService.js';
import { checkAndConsumeRateLimit, resetRateLimit } from './rateLimitService.js';

export const DEFAULT_SETTINGS = {
  allowRegistration: true,
  pendingAlertDays: 3,
  announcement: {
    enabled: false,
    message: '',
    level: 'info',
  },
};

export const settingsUpdateSchema = z
  .object({
    allowRegistration: z.boolean().optional(),
    pendingAlertDays: z.number().int().min(1).max(30).optional(),
    announcement: z
      .object({
        enabled: z.boolean(),
        message: z.string().max(200),
        level: z.enum(['info', 'warning']),
      })
      .optional(),
  })
  .strict();

/**
 * Retrieve all system settings merged with defaults.
 */
export async function getAllSettings() {
  const rows = await db.select().from(systemSettings);
  const result = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) {
      result[row.key] = row.value;
    }
  }

  return result;
}

/**
 * Retrieve a specific system setting by key, or its default.
 */
export async function getSetting(key) {
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key));

  if (row) {
    return row.value;
  }
  return DEFAULT_SETTINGS[key];
}

/**
 * Retrieve public safe settings (e.g. allowRegistration and plain text announcement).
 */
export async function getPublicSettings() {
  const settings = await getAllSettings();
  return {
    allowRegistration: settings.allowRegistration,
    announcement: settings.announcement,
  };
}

/**
 * Validate sensitive action (reason + password + rate limiting).
 */
export async function verifyAdminSensitiveAction(adminUserOrId, passwordOrOptions, reason, reqIp) {
  const adminId = typeof adminUserOrId === 'object' && adminUserOrId !== null
    ? (adminUserOrId.id || adminUserOrId.userId)
    : adminUserOrId;

  let currentPassword = '';
  let actionReason = '';

  if (passwordOrOptions && typeof passwordOrOptions === 'object') {
    currentPassword = passwordOrOptions.password || passwordOrOptions.currentPassword || '';
    actionReason = passwordOrOptions.reason || reason || '';
  } else {
    currentPassword = typeof passwordOrOptions === 'string' ? passwordOrOptions : '';
    actionReason = typeof reason === 'string' ? reason : '';
  }

  // 1. Reason check (3 to 500 chars)
  if (!actionReason || typeof actionReason !== 'string' || actionReason.trim().length < 3 || actionReason.trim().length > 500) {
    const error = new Error('A reason between 3 and 500 characters is required for this action.');
    error.status = 400;
    error.code = 'REASON_REQUIRED';
    throw error;
  }

  // 2. Rate limit wrong password attempts per admin user
  const rateKey = `admin_sensitive_pw:${adminId}`;
  const rateCheck = await checkAndConsumeRateLimit(rateKey, 5, 15 * 60 * 1000);
  if (!rateCheck.allowed) {
    const error = new Error('Too many incorrect password attempts. Please wait 15 minutes.');
    error.status = 429;
    error.code = 'RATE_LIMIT_EXCEEDED';
    throw error;
  }

  // 3. Password check
  if (!currentPassword) {
    const error = new Error('Administrator password is required for confirmation.');
    error.status = 400;
    error.code = 'PASSWORD_REQUIRED';
    throw error;
  }

  const [adminRecord] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, adminId));

  if (!adminRecord) {
    const error = new Error('Administrator account not found.');
    error.status = 404;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const isMatch = await bcrypt.compare(currentPassword, adminRecord.passwordHash);
  if (!isMatch) {
    const error = new Error('Administrator password confirmation is incorrect.');
    error.status = 401;
    error.code = 'INVALID_ADMIN_PASSWORD';
    throw error;
  }

  // Reset rate limit counter on successful password match
  await resetRateLimit(rateKey);
}
