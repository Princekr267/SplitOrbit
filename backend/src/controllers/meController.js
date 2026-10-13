import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import env from '../config/env.js';
import { db } from '../config/db.js';
import {
  users,
  groups,
  people,
  expenses,
  expenseSplits,
  payments,
  recoveryCodes,
} from '../models/index.js';
import { COOKIE_NAME, getAuthCookieOptions, getClearCookieOptions } from '../middleware/authMiddleware.js';
import { calculateUserStats } from '../services/balanceService.js';
import { recordAuditLog } from '../services/auditService.js';
import { checkAndConsumeRateLimit } from '../services/rateLimitService.js';
import { validatePasswordBytes } from '../validations/authValidation.js';

function generateToken(userId, tokenVersion = 0) {
  return jwt.sign(
    { sub: userId, userId, tv: tokenVersion },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, getAuthCookieOptions());
}

/**
 * GET /api/me
 * Full profile of the authenticated user with stats and recovery code counts.
 */
export async function getProfile(req, res, next) {
  try {
    const userId = req.user.id;

    const skipStats = req.query.skipStats === 'true' || req.query.fast === 'true';

    // Run user query, recovery code count, linked groups, and user stats concurrently
    const [userRows, recCodeRows, linkedGroups, stats] = await Promise.all([
      db
        .select()
        .from(users)
        .where(eq(users.id, userId)),
      db
        .select({ count: sql`count(*)::int` })
        .from(recoveryCodes)
        .where(and(eq(recoveryCodes.userId, userId), sql`${recoveryCodes.usedAt} IS NULL`)),
      db
        .select({
          personId: people.id,
          groupId: groups.id,
          groupName: groups.name,
          groupStatus: groups.status,
          isHost: people.isHost,
          canViewAllBills: people.canViewAllBills,
        })
        .from(people)
        .innerJoin(groups, eq(people.groupId, groups.id))
        .where(and(eq(people.linkedUserId, userId), eq(people.isDeleted, false), eq(groups.isDeleted, false))),
      skipStats
        ? Promise.resolve({
            groupsHosted: 0,
            linkedProfiles: 0,
            totalOwedToMe: 0,
            totalIOwe: 0,
            pendingApprovals: 0,
          })
        : calculateUserStats(userId),
    ]);

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    const recCodes = recCodeRows[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatarColor: user.avatarColor || 'indigo',
          upiId: user.upiId,
          showUpi: user.showUpi,
          defaultPaymentMode: user.defaultPaymentMode || 'online',
          defaultSplitType: user.defaultSplitType || 'equal',
          tokenVersion: user.tokenVersion,
          lastLoginAt: user.lastLoginAt,
          passwordChangedAt: user.passwordChangedAt,
          passwordChangeNoticePending: user.passwordChangeNoticePending,
          passwordChangeMethod: user.passwordChangeMethod,
          createdAt: user.createdAt,
        },
        stats,
        groups: linkedGroups,
        recoveryCodesRemaining: recCodes?.count ?? 0,
        remainingRecoveryCodes: recCodes?.count ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/me/profile
 * Updates editable fields: name, phone, email, avatarColor, upiId, showUpi, defaultPaymentMode, defaultSplitType.
 * Usernames are immutable and ignored/rejected.
 */
export async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      name,
      phone,
      email,
      avatarColor,
      upiId,
      showUpi,
      defaultPaymentMode,
      defaultSplitType,
    } = req.body;

    const updateFields = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (cleanName.length < 2 || cleanName.length > 60) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_NAME', message: 'Name must be between 2 and 60 characters.' },
        });
      }
      updateFields.name = cleanName;
    }

    if (phone !== undefined) {
      const cleanPhone = phone ? String(phone).trim() : null;
      if (cleanPhone && !/^\+?[0-9]{10,15}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PHONE', message: 'Phone must be 10-15 digits with optional leading +.' },
        });
      }
      updateFields.phone = cleanPhone;
    }

    if (email !== undefined) {
      const cleanEmail = email ? String(email).trim().toLowerCase() : null;
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_EMAIL', message: 'Invalid email address.' },
        });
      }
      updateFields.email = cleanEmail;
    }

    if (avatarColor !== undefined) {
      const allowedColors = ['indigo', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'blue', 'slate'];
      if (!allowedColors.includes(avatarColor)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_COLOR', message: 'Invalid avatar color palette.' },
        });
      }
      updateFields.avatarColor = avatarColor;
    }

    if (upiId !== undefined) {
      const cleanUpi = upiId ? String(upiId).trim() : null;
      if (cleanUpi && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(cleanUpi)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_UPI', message: 'Invalid UPI ID format (e.g. name@bank).' },
        });
      }
      updateFields.upiId = cleanUpi;
    }

    if (showUpi !== undefined) {
      updateFields.showUpi = Boolean(showUpi);
    }

    if (defaultPaymentMode !== undefined) {
      if (!['online', 'cash'].includes(defaultPaymentMode)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_MODE', message: 'Default payment mode must be online or cash.' },
        });
      }
      updateFields.defaultPaymentMode = defaultPaymentMode;
    }

    if (defaultSplitType !== undefined) {
      if (!['equal', 'exact', 'percentage'].includes(defaultSplitType)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_SPLIT_TYPE', message: 'Default split type must be equal, exact, or percentage.' },
        });
      }
      updateFields.defaultSplitType = defaultSplitType;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, userId))
      .returning();

    await recordAuditLog({
      actor: { id: userId, role: updatedUser.role, name: updatedUser.name },
      action: 'user.update_profile',
      entityType: 'User',
      entityId: userId,
      reason: 'profile update',
    });

    const userPayload = {
      id: updatedUser.id,
      name: updatedUser.name,
      username: updatedUser.username,
      email: updatedUser.email,
      phone: updatedUser.phone,
      avatarColor: updatedUser.avatarColor,
      upiId: updatedUser.upiId,
      showUpi: updatedUser.showUpi,
      defaultPaymentMode: updatedUser.defaultPaymentMode,
      defaultSplitType: updatedUser.defaultSplitType,
      updatedAt: updatedUser.updatedAt,
    };

    res.json({
      success: true,
      data: {
        ...userPayload,
        user: userPayload,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/me/change-password
 * Requires current password. Increments token_version to terminate other sessions,
 * but re-issues session token with new token_version so current session stays active.
 */
export async function changePassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Current password and new password are required.' },
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect.' },
      });
    }

    if (!validatePasswordBytes(newPassword, user.username)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'New password must be 8-72 bytes and not match username.' },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    const nextTokenVersion = user.tokenVersion + 1;

    await db
      .update(users)
      .set({
        passwordHash: newHash,
        tokenVersion: nextTokenVersion,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Re-issue cookie with new tokenVersion for this active session
    const newToken = generateToken(userId, nextTokenVersion);
    setAuthCookie(res, newToken);

    await recordAuditLog({
      actor: { id: userId, role: user.role, name: user.name },
      action: 'auth.change_password',
      entityType: 'User',
      entityId: userId,
      reason: 'user requested',
    });

    res.json({
      success: true,
      message: 'Password changed successfully. Other devices have been signed out.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/me/sign-out-all
 * Increments token_version to revoke all sessions, and clears current cookie.
 */
export async function signOutAll(req, res, next) {
  try {
    const userId = req.user.id;

    await db
      .update(users)
      .set({
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    res.clearCookie(COOKIE_NAME, getClearCookieOptions());

    await recordAuditLog({
      actor: { id: userId, role: req.user.role, name: req.user.name },
      action: 'auth.sign_out_all',
      entityType: 'User',
      entityId: userId,
      reason: 'user requested',
    });

    res.json({
      success: true,
      message: 'Signed out of all devices successfully.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/me/export
 * Rate-limited export of user's own data in JSON format.
 * Never includes hashes, tokens, or other users' private details.
 */
export async function exportUserData(req, res, next) {
  try {
    const userId = req.user.id;
    const ip = req.ip || '127.0.0.1';

    // Rate limit: 5 per hour per user
    const rateCheck = await checkAndConsumeRateLimit(`export:user:${userId}`, 5, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      res.set('Retry-After', String(rateCheck.retryAfterSeconds || 3600));
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many export requests. Please try again later.' },
      });
    }

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        avatarColor: users.avatarColor,
        upiId: users.upiId,
        showUpi: users.showUpi,
        defaultPaymentMode: users.defaultPaymentMode,
        defaultSplitType: users.defaultSplitType,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    // Groups hosted by this user
    const hosted = await db
      .select({
        id: groups.id,
        name: groups.name,
        date: groups.date,
        description: groups.description,
        status: groups.status,
        createdAt: groups.createdAt,
      })
      .from(groups)
      .where(and(eq(groups.createdBy, userId), eq(groups.isDeleted, false)));

    // People profiles linked to this user (both host and friend profiles)
    const myPeople = await db
      .select({
        id: people.id,
        groupId: people.groupId,
        name: people.name,
        isHost: people.isHost,
        note: people.note,
        createdAt: people.createdAt,
      })
      .from(people)
      .where(
        and(
          eq(people.isDeleted, false),
          sql`(${people.linkedUserId} = ${userId} OR ${people.groupId} IN (SELECT id FROM groups WHERE created_by = ${userId} AND is_deleted = false))`
        )
      );

    const myPersonIds = myPeople.map((p) => p.id);

    // Expenses paid by this user's profiles
    let myExpenses = [];
    let mySplits = [];
    let mySentPayments = [];
    let myReceivedPayments = [];

    if (myPersonIds.length > 0) {
      myExpenses = await db
        .select({
          id: expenses.id,
          groupId: expenses.groupId,
          title: expenses.title,
          totalAmount: expenses.totalAmount,
          date: expenses.date,
          splitType: expenses.splitType,
          description: expenses.description,
          createdAt: expenses.createdAt,
        })
        .from(expenses)
        .where(and(inArray(expenses.paidByPersonId, myPersonIds), eq(expenses.isDeleted, false)));

      mySplits = await db
        .select({
          id: expenseSplits.id,
          expenseId: expenseSplits.expenseId,
          groupId: expenseSplits.groupId,
          amount: expenseSplits.amount,
          exactAmount: expenseSplits.exactAmount,
          basisPoints: expenseSplits.basisPoints,
        })
        .from(expenseSplits)
        .where(inArray(expenseSplits.personId, myPersonIds));

      mySentPayments = await db
        .select({
          id: payments.id,
          groupId: payments.groupId,
          amount: payments.amount,
          date: payments.date,
          mode: payments.mode,
          description: payments.description,
          status: payments.status,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .where(and(inArray(payments.fromPersonId, myPersonIds), eq(payments.isDeleted, false)));

      myReceivedPayments = await db
        .select({
          id: payments.id,
          groupId: payments.groupId,
          amount: payments.amount,
          date: payments.date,
          mode: payments.mode,
          description: payments.description,
          status: payments.status,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .where(and(inArray(payments.toPersonId, myPersonIds), eq(payments.isDeleted, false)));
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      user,
      hostedGroups: hosted,
      linkedProfiles: myPeople,
      expensesPaid: myExpenses,
      splitsAssigned: mySplits,
      paymentsSent: mySentPayments,
      paymentsReceived: myReceivedPayments,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="splittrack-data-${user.username}.json"`);
    res.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/me/dismiss-password-notice
 */
export async function dismissNotice(req, res, next) {
  try {
    await db
      .update(users)
      .set({ passwordChangeNoticePending: false, updatedAt: new Date() })
      .where(eq(users.id, req.user.id));

    res.json({
      success: true,
      message: 'Password notice dismissed.',
    });
  } catch (error) {
    next(error);
  }
}
