import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import env from '../config/env.js';
import { db } from '../config/db.js';
import { users } from '../models/index.js';

export const COOKIE_NAME = 'splitorbit_token';
export const ADMIN_COOKIE_NAME = 'splitorbit_admin_token';

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

export function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

export async function authenticate(req, res, next) {
  try {
    const token =
      req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
      req.cookies?.[COOKIE_NAME] ||
      req.cookies?.['splittrack_token'];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required. Please log in.',
        },
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Session has expired or is invalid. Please log in again.',
        },
      });
    }

    const userId = decoded.sub || decoded.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid session payload.',
        },
      });
    }

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        deactivatedReason: users.deactivatedReason,
        tokenVersion: users.tokenVersion,
        passwordChangeNoticePending: users.passwordChangeNoticePending,
        passwordChangeMethod: users.passwordChangeMethod,
        passwordChangedAt: users.passwordChangedAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User no longer exists. Please log in again.',
        },
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
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

    // Check token version if present in payload
    if (decoded.tv !== undefined && decoded.tv !== user.tokenVersion) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REVOKED',
          message: 'Your session has been signed out. Please log in again.',
        },
      });
    }

    if (decoded.impersonatedBy) {
      const [impersonator] = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, decoded.impersonatedBy));

      if (!impersonator || !impersonator.isActive || impersonator.role !== 'admin') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'IMPERSONATION_REVOKED',
            message: 'The administrator session is no longer active.',
          },
        });
      }

      user.isImpersonated = true;
      user.impersonatedBy = impersonator.id;
      user.impersonator = {
        id: impersonator.id,
        name: impersonator.name,
        username: impersonator.username,
      };
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
