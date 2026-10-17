import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, sql, and, desc } from 'drizzle-orm';
import env from '../config/env.js';
import { db } from '../config/db.js';
import { users, recoveryCodes, passwordResets, resetRequests, people, groups } from '../models/index.js';
import { COOKIE_NAME, ADMIN_COOKIE_NAME, getAuthCookieOptions, getClearCookieOptions } from '../middleware/authMiddleware.js';
import {
  generateEightRecoveryCodes,
  verifyRecoveryCode,
  hashResetToken,
} from '../services/recoveryService.js';
import {
  checkAndConsumeRateLimit,
  isRateLimited,
  recordFailedAttempt,
  resetRateLimit,
} from '../services/rateLimitService.js';
import { recordAuditLog } from '../services/auditService.js';
import { isReservedUsername } from '../validations/authValidation.js';
import { getSetting } from '../services/settingsService.js';
import { hashToken } from '../services/tokenService.js';
import { getClientIp } from '../utils/ipHelper.js';

export const BCRYPT_ROUNDS = 10;
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy_timing_salt_password', BCRYPT_ROUNDS);

export const INVALID_CREDENTIALS_RESPONSE = {
  success: false,
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid username or password.',
  },
};

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
 * Live username availability check.
 * GET /api/auth/username-available?u=
 */
export async function checkUsernameAvailable(req, res, next) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkAndConsumeRateLimit(
      `username_avail:ip:${ip}`,
      30,
      60 * 1000 // 30 per minute per IP
    );

    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many availability checks. Please wait a moment.',
        },
      });
    }

    const raw = String(req.query.u || '').trim().toLowerCase();
    if (!raw || !/^[a-z][a-z0-9_]{2,19}$/.test(raw) || isReservedUsername(raw)) {
      return res.json({ success: true, data: { available: false } });
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, raw));

    res.json({ success: true, data: { available: !existing } });
  } catch (error) {
    next(error);
  }
}

/**
 * Register a new user account with permanent username and 8 recovery codes.
 * POST /api/auth/register
 */
export async function register(req, res, next) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkAndConsumeRateLimit(
      `register:ip:${ip}`,
      10,
      60 * 60 * 1000 // 10 per hour per IP
    );

    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many registration attempts. Please try again later.',
        },
      });
    }

    const { name, username, password, email, phone, inviteCode, shareToken } = req.body;
    const cleanInviteCode = typeof inviteCode === 'string' ? inviteCode.trim() : '';
    const cleanShareToken = typeof shareToken === 'string' ? shareToken.trim() : '';

    let invitePerson = null;
    let inviteGroup = null;

    if (cleanInviteCode) {
      const codeHash = hashToken(cleanInviteCode);
      const [foundPerson] = await db
        .select({
          id: people.id,
          groupId: people.groupId,
          name: people.name,
          isHost: people.isHost,
          linkedUserId: people.linkedUserId,
          inviteExpiresAt: people.inviteExpiresAt,
          isDeleted: people.isDeleted,
        })
        .from(people)
        .where(
          and(
            eq(people.inviteCodeHash, codeHash),
            eq(people.isDeleted, false)
          )
        );

      if (!foundPerson) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVITE_INVALID',
            message: 'This invite code is invalid or no longer exists.',
          },
        });
      }

      if (foundPerson.linkedUserId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVITE_INVALID',
            message: 'This invite code has already been claimed.',
          },
        });
      }

      if (foundPerson.inviteExpiresAt && new Date(foundPerson.inviteExpiresAt) < new Date()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVITE_INVALID',
            message: 'This invite code has expired.',
          },
        });
      }

      const [foundGroup] = await db
        .select({ id: groups.id, name: groups.name, isDeleted: groups.isDeleted })
        .from(groups)
        .where(eq(groups.id, foundPerson.groupId));

      if (!foundGroup || foundGroup.isDeleted) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVITE_INVALID',
            message: 'The group associated with this invite no longer exists.',
          },
        });
      }

      invitePerson = foundPerson;
      inviteGroup = foundGroup;
    } else if (cleanShareToken) {
      const shareHash = hashToken(cleanShareToken);
      const [foundPerson] = await db
        .select({
          id: people.id,
          groupId: people.groupId,
          name: people.name,
          isHost: people.isHost,
          linkedUserId: people.linkedUserId,
          shareEnabled: people.shareEnabled,
          isDeleted: people.isDeleted,
        })
        .from(people)
        .where(
          and(
            eq(people.shareTokenHash, shareHash),
            eq(people.shareEnabled, true),
            eq(people.isDeleted, false)
          )
        );

      if (foundPerson && !foundPerson.linkedUserId && !foundPerson.isHost) {
        const [foundGroup] = await db
          .select({ id: groups.id, name: groups.name, isDeleted: groups.isDeleted })
          .from(groups)
          .where(eq(groups.id, foundPerson.groupId));

        if (foundGroup && !foundGroup.isDeleted) {
          invitePerson = foundPerson;
          inviteGroup = foundGroup;
        }
      }
    }

    const allowRegistration = await getSetting('allowRegistration');
    if (allowRegistration === false && !invitePerson) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'REGISTRATION_DISABLED',
          message: 'Registration is currently invite-only. A valid invite code is required.',
        },
      });
    }

    const cleanUsername = username.toLowerCase().trim();

    if (isReservedUsername(cleanUsername)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'RESERVED_USERNAME',
          message: 'This username is reserved and cannot be registered.',
        },
      });
    }

    // Check if username is already taken
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, cleanUsername));

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USERNAME_TAKEN',
          message: 'An account with this username already exists.',
        },
      });
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate 8 cryptographically secure recovery codes
    const generatedCodes = generateEightRecoveryCodes();

    // Execute in transaction: create user, insert recovery codes, and atomically link invite
    const { createdUser, claimedInfo } = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: name.trim(),
          username: cleanUsername,
          email: email ? email.toLowerCase().trim() : null,
          phone: phone ? phone.trim() : null,
          passwordHash,
          role: 'user',
          isActive: true,
          tokenVersion: 0,
        })
        .returning({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          phone: users.phone,
          role: users.role,
          tokenVersion: users.tokenVersion,
          createdAt: users.createdAt,
        });

      // Insert 8 hashed recovery codes
      for (const rc of generatedCodes) {
        await tx.insert(recoveryCodes).values({
          userId: user.id,
          codeHash: rc.hash,
        });
      }

      let claimed = null;
      if (invitePerson) {
        const [claimedPerson] = await tx
          .update(people)
          .set({
            linkedUserId: user.id,
            inviteCodeHash: null,
            inviteExpiresAt: null,
          })
          .where(
            and(
              eq(people.id, invitePerson.id),
              sql`${people.linkedUserId} IS NULL`
            )
          )
          .returning();

        if (!claimedPerson) {
          throw {
            status: 409,
            code: 'CLAIM_RACE_LOST',
            message: 'This invite was already claimed by another user.',
          };
        }

        await recordAuditLog(
          {
            actor: { id: user.id, role: user.role, name: user.name },
            action: 'invite.claim',
            entityType: 'Person',
            entityId: claimedPerson.id,
            groupId: claimedPerson.groupId,
            after: { linkedUserId: user.id },
            ipAddress: ip,
          },
          tx
        );

        claimed = {
          personId: claimedPerson.id,
          groupId: claimedPerson.groupId,
          groupName: inviteGroup.name,
        };
      }

      await recordAuditLog(
        {
          actor: { id: user.id, role: user.role, name: user.name },
          action: 'auth.register',
          entityType: 'User',
          entityId: user.id,
          after: { username: cleanUsername, name: user.name },
          ipAddress: ip,
        },
        tx
      );

      return { createdUser: user, claimedInfo: claimed };
    });

    const token = generateToken(createdUser.id, createdUser.tokenVersion || 0);
    setAuthCookie(res, token);

    res.status(201).json({
      success: true,
      data: {
        user: createdUser,
        token,
        recoveryCodes: generatedCodes.map((c) => c.plain),
        claimed: claimedInfo ? { personId: claimedInfo.personId, groupName: claimedInfo.groupName } : undefined,
      },
    });
  } catch (error) {
    if (error.code && error.status) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
}

/**
 * Login with username and password.
 * POST /api/auth/login
 */
export async function login(req, res, next) {
  try {
    const ip = getClientIp(req);
    const { username, password } = req.body;
    const cleanUsername = String(username || '').toLowerCase().trim();

    // Rate limiting strategy:
    // 1. Per-IP limiter (generous: 30 attempts per 15 min) prevents mass credential stuffing
    //    from a single IP without prematurely locking out shared NAT / office / campus IPs.
    // 2. Per-username failed limiter (strict: 5 failed attempts per 15 min) prevents distributed
    //    brute-force attacks targeting a specific account across multiple proxies.
    // Security tradeoff note: A per-username lockout introduces the possibility of targeted lockout DoS
    // (an attacker intentionally locking out a known victim). To minimize impact, only failed attempts
    // are counted, the window is limited to 15 minutes, and the response is generic so existence is not leaked.
    const ipRateKey = `login:ip:${ip}`;
    const userFailKey = `login:user:${cleanUsername}`;

    // Check IP rate limit (30 requests / 15 min)
    const ipRateCheck = await checkAndConsumeRateLimit(ipRateKey, 30, 15 * 60 * 1000);
    if (!ipRateCheck.allowed) {
      res.set('Retry-After', String(ipRateCheck.retryAfterSeconds || 900));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts. Please try again after 15 minutes.',
        },
      });
    }

    // Check per-username failed attempts limit without revealing account existence
    const userLimitCheck = await isRateLimited(userFailKey, 5, 15 * 60 * 1000);
    if (userLimitCheck.isLimited) {
      res.set('Retry-After', String(userLimitCheck.retryAfterSeconds || 900));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts. Please try again after 15 minutes.',
        },
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername));

    // Constant-time dummy compare if user does not exist
    if (!user) {
      await recordFailedAttempt(userFailKey, 5, 15 * 60 * 1000);
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return res.status(401).json(INVALID_CREDENTIALS_RESPONSE);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await recordFailedAttempt(userFailKey, 5, 15 * 60 * 1000);
      return res.status(401).json(INVALID_CREDENTIALS_RESPONSE);
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'This account has been deactivated.',
          details: {
            reason: user.deactivatedReason || 'Administrative decision',
          },
        },
      });
    }

    // Success: update lastLoginAt and reset login rate limits
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    await resetRateLimit(userFailKey);
    await resetRateLimit(ipRateKey);

    const token = generateToken(user.id, user.tokenVersion);
    setAuthCookie(res, token);

    await recordAuditLog({
      actor: { id: user.id, role: user.role, name: user.name },
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
    });

    const safeUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      passwordChangeNoticePending: user.passwordChangeNoticePending,
      passwordChangeMethod: user.passwordChangeMethod,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
    };

    res.json({
      success: true,
      data: {
        user: safeUser,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Redeem a one-time recovery code to change password.
 * POST /api/auth/recover
 */
export async function recoverWithCode(req, res, next) {
  try {
    const ip = getClientIp(req);
    const { username, code, recoveryCode, newPassword } = req.body;
    const cleanUsername = String(username || '').toLowerCase().trim();
    const codeInput = recoveryCode || code;

    // Check failed attempt rate limits: 5 failed/hour per user, 20 failed/hour per IP
    const userLimitCheck = await isRateLimited(
      `recover_fail:user:${cleanUsername}`,
      5,
      60 * 60 * 1000
    );
    const ipLimitCheck = await isRateLimited(
      `recover_fail:ip:${ip}`,
      20,
      60 * 60 * 1000
    );

    if (userLimitCheck.isLimited || ipLimitCheck.isLimited) {
      res.set('Retry-After', String(userLimitCheck.retryAfterSeconds || ipLimitCheck.retryAfterSeconds || 3600));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many failed recovery attempts. Please try again later or ask your admin for a reset link.',
        },
      });
    }

    const genericError = {
      success: false,
      error: {
        code: 'INVALID_RECOVERY_CODE',
        message: 'Invalid recovery code or account details.',
      },
    };

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername));

    // Admin accounts can NEVER use recovery codes
    if (!user || !user.isActive || user.role === 'admin') {
      const failRate = await recordFailedAttempt(`recover_fail:user:${cleanUsername}`, 5, 60 * 60 * 1000);
      await recordFailedAttempt(`recover_fail:ip:${ip}`, 20, 60 * 60 * 1000);
      if (!failRate.allowed) {
        res.set('Retry-After', String(failRate.retryAfterSeconds || 3600));
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many failed recovery attempts.',
          },
        });
      }
      return res.status(400).json(genericError);
    }

    // Fetch unused recovery codes for this user
    const userCodes = await db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, user.id), sql`${recoveryCodes.usedAt} IS NULL`));

    let matchedCode = null;
    for (const rc of userCodes) {
      if (verifyRecoveryCode(codeInput, rc.codeHash)) {
        matchedCode = rc;
        break;
      }
    }

    if (!matchedCode) {
      const failRate = await recordFailedAttempt(`recover_fail:user:${cleanUsername}`, 5, 60 * 60 * 1000);
      await recordFailedAttempt(`recover_fail:ip:${ip}`, 20, 60 * 60 * 1000);
      if (!failRate.allowed) {
        res.set('Retry-After', String(failRate.retryAfterSeconds || 3600));
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many failed recovery attempts.',
          },
        });
      }
      return res.status(400).json(genericError);
    }

    // Success: mark code used, update password, bump tokenVersion, set notice
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const newHash = await bcrypt.hash(newPassword, salt);
    const now = new Date();

    await db.transaction(async (tx) => {
      // Mark recovery code used
      await tx
        .update(recoveryCodes)
        .set({ usedAt: now })
        .where(eq(recoveryCodes.id, matchedCode.id));

      // Update user password and notice
      await tx
        .update(users)
        .set({
          passwordHash: newHash,
          passwordChangedAt: now,
          tokenVersion: user.tokenVersion + 1, // Sign out all sessions
          passwordChangeNoticePending: true,
          passwordChangeMethod: 'recovery_code',
        })
        .where(eq(users.id, user.id));

      // Void any open admin resets
      await tx
        .update(passwordResets)
        .set({ usedAt: now })
        .where(and(eq(passwordResets.userId, user.id), sql`${passwordResets.usedAt} IS NULL`));

      // Fulfill any open reset requests
      await tx
        .update(resetRequests)
        .set({ status: 'fulfilled', handledAt: now })
        .where(and(eq(resetRequests.userId, user.id), eq(resetRequests.status, 'open')));

      await recordAuditLog(
        {
          actor: { id: user.id, role: user.role, name: user.name },
          action: 'auth.password_recovered',
          entityType: 'User',
          entityId: user.id,
          ipAddress: ip,
        },
        tx
      );
    });

    // Reset failed attempt counter
    await resetRateLimit(`recover_fail:user:${cleanUsername}`);

    // Do NOT auto-login
    res.json({
      success: true,
      message: 'Password recovered successfully. Please log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Submit a request to the admin for a password reset credential.
 * POST /api/auth/reset-requests
 */
export async function submitResetRequest(req, res, next) {
  try {
    const ip = getClientIp(req);
    const { username, note, userNote, contactChannel } = req.body;
    const cleanUsername = String(username || '').toLowerCase().trim();

    // Rate limits: 3 per hour per IP
    const ipRate = await checkAndConsumeRateLimit(`reset_req:ip:${ip}`, 3, 60 * 60 * 1000);
    if (!ipRate.allowed) {
      res.set('Retry-After', String(ipRate.retryAfterSeconds || 3600));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many reset requests submitted. Please wait before trying again.',
        },
      });
    }

    const genericSuccess = {
      success: true,
      message: 'If this account exists, an admin has been notified. Contact your admin to get your reset link.',
    };

    const [user] = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.username, cleanUsername));

    // Admin accounts cannot have reset requests, and user must be active
    if (!user || !user.isActive || user.role === 'admin') {
      return res.json(genericSuccess);
    }

    const cleanNote = note ? String(note).trim().slice(0, 300) : null;

    // Check for existing open request
    const [existingOpen] = await db
      .select()
      .from(resetRequests)
      .where(and(eq(resetRequests.userId, user.id), eq(resetRequests.status, 'open')));

    if (existingOpen) {
      await db
        .update(resetRequests)
        .set({
          note: cleanNote || existingOpen.note,
          createdAt: new Date(),
        })
        .where(eq(resetRequests.id, existingOpen.id));
    } else {
      await db.insert(resetRequests).values({
        userId: user.id,
        note: cleanNote,
        status: 'open',
      });
    }

    res.json(genericSuccess);
  } catch (error) {
    next(error);
  }
}

/**
 * Validate an admin-issued reset link token.
 * GET /api/auth/reset-password/validate?token=
 */
export async function validateResetToken(req, res, next) {
  try {
    const rawToken = String(req.query.token || '').trim();
    if (!rawToken) {
      return res.json({ success: true, data: { valid: false } });
    }

    const tokenHash = hashResetToken(rawToken);
    const now = new Date();

    const [resetRecord] = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          sql`${passwordResets.usedAt} IS NULL`,
          sql`${passwordResets.expiresAt} > ${now}`
        )
      );

    if (!resetRecord) {
      return res.json({ success: true, data: { valid: false } });
    }

    const [user] = await db
      .select({ username: users.username, isActive: users.isActive, role: users.role })
      .from(users)
      .where(eq(users.id, resetRecord.userId));

    if (!user || !user.isActive || user.role === 'admin') {
      return res.json({ success: true, data: { valid: false } });
    }

    res.json({
      success: true,
      data: { valid: true, username: user.username },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Redeem admin-issued reset credential (either long token or short code).
 * POST /api/auth/reset-password
 */
export async function resetPassword(req, res, next) {
  try {
    const ip = getClientIp(req);
    // 10 per hour per IP
    const rateCheck = await checkAndConsumeRateLimit(`reset_pwd:ip:${ip}`, 10, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many password reset attempts. Please try again later.',
        },
      });
    }

    const { token, username, code, resetCode, newPassword } = req.body;
    const cleanCode = (resetCode || code) ? String(resetCode || code).trim() : null;
    const cleanUsername = username ? String(username).toLowerCase().trim() : null;

    const genericError = {
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid, expired, or deactivated reset credential.',
      },
    };

    const now = new Date();
    let resetRecord = null;
    let targetUser = null;
    let method = 'reset_link';

    if (token) {
      // Long token redemption (no attempt counter)
      const tokenHash = hashResetToken(token.trim());
      const [found] = await db
        .select()
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.tokenHash, tokenHash),
            sql`${passwordResets.usedAt} IS NULL`,
            sql`${passwordResets.expiresAt} > ${now}`
          )
        );

      if (!found) return res.status(400).json(genericError);
      resetRecord = found;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, resetRecord.userId));

      if (!user || !user.isActive || user.role === 'admin') {
        return res.status(400).json(genericError);
      }
      targetUser = user;
      method = 'reset_link';
    } else if (cleanUsername && cleanCode) {
      // Short code redemption
      const isCodeLimited = await isRateLimited(`reset_code:user:${cleanUsername}`, 5, 15 * 60 * 1000);
      if (isCodeLimited.isLimited) {
        res.set('Retry-After', String(isCodeLimited.retryAfterSeconds || 900));
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many failed code reset attempts.',
          },
        });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, cleanUsername));

      if (!user || !user.isActive || user.role === 'admin') {
        const failRate = await recordFailedAttempt(`reset_code:user:${cleanUsername}`, 5, 15 * 60 * 1000);
        if (!failRate.allowed) {
          res.set('Retry-After', String(failRate.retryAfterSeconds || 900));
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many failed code reset attempts.',
            },
          });
        }
        return res.status(400).json(genericError);
      }

      // Find active reset record for this user (not expired, not used, failedAttempts < 5)
      const [found] = await db
        .select()
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.userId, user.id),
            sql`${passwordResets.usedAt} IS NULL`,
            sql`${passwordResets.expiresAt} > ${now}`,
            sql`${passwordResets.failedAttempts} < 5`
          )
        )
        .orderBy(desc(passwordResets.createdAt));

      if (!found) {
        const failRate = await recordFailedAttempt(`reset_code:user:${cleanUsername}`, 5, 15 * 60 * 1000);
        if (!failRate.allowed) {
          res.set('Retry-After', String(failRate.retryAfterSeconds || 900));
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many failed code reset attempts.',
            },
          });
        }
        return res.status(400).json(genericError);
      }

      // Verify code
      const isMatch = verifyRecoveryCode(cleanCode, found.codeHash) || hashResetToken(cleanCode) === found.codeHash;
      if (!isMatch) {
        // Increment failed attempts on the record (kills at 5)
        await db
          .update(passwordResets)
          .set({ failedAttempts: found.failedAttempts + 1 })
          .where(eq(passwordResets.id, found.id));

        const failRate = await recordFailedAttempt(`reset_code:user:${cleanUsername}`, 5, 15 * 60 * 1000);
        if (!failRate.allowed) {
          res.set('Retry-After', String(failRate.retryAfterSeconds || 900));
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many failed code reset attempts.',
            },
          });
        }
        return res.status(400).json(genericError);
      }

      await resetRateLimit(`reset_code:user:${cleanUsername}`);
      resetRecord = found;
      targetUser = user;
      method = 'reset_code';
    } else {
      return res.status(400).json(genericError);
    }

    // Apply password change in transaction
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const newHash = await bcrypt.hash(newPassword, salt);

    await db.transaction(async (tx) => {
      // Update user
      await tx
        .update(users)
        .set({
          passwordHash: newHash,
          passwordChangedAt: now,
          tokenVersion: targetUser.tokenVersion + 1, // Invalidates all old sessions
          passwordChangeNoticePending: true,
          passwordChangeMethod: method,
        })
        .where(eq(users.id, targetUser.id));

      // Mark this reset record used
      await tx
        .update(passwordResets)
        .set({ usedAt: now })
        .where(eq(passwordResets.id, resetRecord.id));

      // Void any other open resets for this user
      await tx
        .update(passwordResets)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResets.userId, targetUser.id),
            sql`${passwordResets.usedAt} IS NULL`
          )
        );

      // Mark any linked or open reset requests fulfilled
      await tx
        .update(resetRequests)
        .set({ status: 'fulfilled', handledAt: now })
        .where(
          and(
            eq(resetRequests.userId, targetUser.id),
            eq(resetRequests.status, 'open')
          )
        );

      await recordAuditLog(
        {
          actor: { id: targetUser.id, role: targetUser.role, name: targetUser.name },
          action: 'auth.password_reset',
          entityType: 'User',
          entityId: targetUser.id,
          after: { method },
          ipAddress: ip,
        },
        tx
      );
    });

    // Do NOT auto-login
    res.json({
      success: true,
      message: 'Your password has been reset successfully. Please log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Current user profile endpoint.
 * GET /api/me
 */
export async function me(req, res) {
  const user = req.user;
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
        tokenVersion: user.tokenVersion,
        passwordChangeNoticePending: user.passwordChangeNoticePending,
        passwordChangeMethod: user.passwordChangeMethod,
        passwordChangedAt: user.passwordChangedAt,
        isImpersonated: Boolean(user.isImpersonated),
        impersonatedBy: user.impersonatedBy || null,
        impersonator: user.impersonator || null,
        passwordChangeNotice: user.passwordChangeNoticePending
          ? {
              changedAt: user.passwordChangedAt,
              method: user.passwordChangeMethod,
            }
          : null,
      },
    },
  });
}

/**
 * Dismiss the password changed banner notice.
 * POST /api/me/dismiss-password-notice
 */
export async function dismissPasswordNotice(req, res, next) {
  try {
    await db
      .update(users)
      .set({ passwordChangeNoticePending: false })
      .where(eq(users.id, req.user.id));

    res.json({
      success: true,
      message: 'Notice dismissed.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Exit impersonation mode and restore the administrator session.
 * POST /api/auth/exit-impersonation
 */
export async function exitImpersonation(req, res, next) {
  try {
    const backupAdminToken = req.cookies?.[ADMIN_COOKIE_NAME];
    const impersonatorId = req.user?.impersonatedBy;

    if (!impersonatorId && !backupAdminToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NOT_IMPERSONATING',
          message: 'No active impersonation session found.',
        },
      });
    }

    let adminId = impersonatorId;
    if (!adminId && backupAdminToken) {
      try {
        const decodedAdmin = jwt.verify(backupAdminToken, env.JWT_SECRET);
        adminId = decodedAdmin.sub || decodedAdmin.userId;
      } catch (e) {
        // invalid backup token
      }
    }

    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ADMIN_SESSION',
          message: 'Unable to restore administrator session.',
        },
      });
    }

    const [adminUser] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        tokenVersion: users.tokenVersion,
        avatarColor: users.avatarColor,
      })
      .from(users)
      .where(eq(users.id, adminId));

    if (!adminUser || !adminUser.isActive || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ADMIN_ACCOUNT_INVALID',
          message: 'Administrator account is not valid or no longer active.',
        },
      });
    }

    const adminToken = generateToken(adminUser.id, adminUser.tokenVersion);

    // Set cookie back to admin token, clear the admin backup cookie
    res.cookie(COOKIE_NAME, adminToken, getAuthCookieOptions());
    res.clearCookie(ADMIN_COOKIE_NAME, getClearCookieOptions());

    // Record audit log
    await recordAuditLog({
      actor: { id: adminUser.id, role: 'admin', name: adminUser.name },
      action: 'admin.user.impersonate_end',
      entityType: 'User',
      entityId: req.user.id,
      reason: 'Admin exited impersonation session',
      after: { restoredAdminId: adminUser.id },
      ipAddress: getClientIp(req),
    });

    res.json({
      success: true,
      data: {
        token: adminToken,
        user: {
          id: adminUser.id,
          name: adminUser.name,
          username: adminUser.username,
          email: adminUser.email,
          phone: adminUser.phone,
          role: adminUser.role,
          avatarColor: adminUser.avatarColor || 'indigo',
          isImpersonated: false,
        },
      },
      message: 'Successfully exited impersonation mode.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Logout current session.
 * POST /api/auth/logout
 */
export async function logout(req, res) {
  res.clearCookie(COOKIE_NAME, getClearCookieOptions());
  res.clearCookie(ADMIN_COOKIE_NAME, getClearCookieOptions());
  res.json({
    success: true,
    message: 'Logged out successfully.',
  });
}
