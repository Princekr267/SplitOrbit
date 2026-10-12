import bcrypt from 'bcryptjs';
import { eq, and, sql, desc, ilike, or, isNull } from 'drizzle-orm';
import { db } from '../config/db.js';
import {
  users,
  groups,
  expenses,
  payments,
  auditLogs,
  people,
  resetRequests,
  passwordResets,
  recoveryCodes,
  systemSettings,
  integrityReports,
  expenseSplits,
} from '../models/index.js';
import { recordAuditLog } from '../services/auditService.js';
import {
  generateResetToken,
  generateRawCode,
  formatCode,
  hashResetToken,
  hashRecoveryCode,
} from '../services/recoveryService.js';
import { buildResetUrl } from '../utils/urlHelper.js';
import {
  getAllSettings,
  getSetting,
  settingsUpdateSchema,
  verifyAdminSensitiveAction,
} from '../services/settingsService.js';
import { calculateGroupBalances } from '../services/balanceService.js';
import { runIntegrityCheck, getLatestIntegrityReport } from '../services/integrityService.js';

/**
 * High-level system health & volume statistics.
 */
export async function getSystemStats(req, res, next) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const pendingAlertDays = await getSetting('pendingAlertDays');
    const alertThreshold = new Date(now.getTime() - pendingAlertDays * 24 * 60 * 60 * 1000);

    const [userCount] = await db
      .select({
        total: sql`count(*)::int`,
        active: sql`count(*) filter (where ${users.isActive} = true)::int`,
        new7Days: sql`count(*) filter (where ${users.createdAt} >= ${sevenDaysAgo})::int`,
        new30Days: sql`count(*) filter (where ${users.createdAt} >= ${thirtyDaysAgo})::int`,
      })
      .from(users);

    const [groupCount] = await db
      .select({
        total: sql`count(*)::int`,
        active: sql`count(*) filter (where ${groups.status} = 'active' and ${groups.isDeleted} = false)::int`,
        settled: sql`count(*) filter (where ${groups.status} = 'settled' and ${groups.isDeleted} = false)::int`,
        frozen: sql`count(*) filter (where ${groups.isFrozen} = true and ${groups.isDeleted} = false)::int`,
        deleted: sql`count(*) filter (where ${groups.isDeleted} = true)::int`,
      })
      .from(groups);

    const [expenseStats] = await db
      .select({
        totalCount: sql`count(*)::int`,
        totalVolume: sql`coalesce(sum(${expenses.totalAmount}) filter (where ${expenses.isDeleted} = false), 0)::bigint`,
        voidedCount: sql`count(*) filter (where ${expenses.isDeleted} = true)::int`,
      })
      .from(expenses);

    const [paymentStats] = await db
      .select({
        totalCount: sql`count(*)::int`,
        acceptedVolume: sql`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'accepted' and ${payments.isDeleted} = false), 0)::bigint`,
        pendingCount: sql`count(*) filter (where ${payments.status} = 'pending' and ${payments.isDeleted} = false)::int`,
        pendingVolume: sql`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'pending' and ${payments.isDeleted} = false), 0)::bigint`,
        pendingOlderCount: sql`count(*) filter (where ${payments.status} = 'pending' and ${payments.isDeleted} = false and ${payments.createdAt} <= ${alertThreshold})::int`,
        pendingOlderVolume: sql`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'pending' and ${payments.isDeleted} = false and ${payments.createdAt} <= ${alertThreshold}), 0)::bigint`,
        voidedCount: sql`count(*) filter (where ${payments.isDeleted} = true or ${payments.status} = 'rejected')::int`,
      })
      .from(payments);

    const [openResets] = await db
      .select({ count: sql`count(*)::int` })
      .from(resetRequests)
      .where(eq(resetRequests.status, 'open'));

    const [actionsToday] = await db
      .select({ count: sql`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          sql`${auditLogs.createdAt} >= ${startOfToday}`,
          or(eq(auditLogs.actorRole, 'admin'), ilike(auditLogs.action, 'admin.%'))
        )
      );

    // Signups per day for the last 14 days
    const signupsRaw = await db
      .select({
        date: sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`,
        count: sql`count(*)::int`,
      })
      .from(users)
      .where(sql`${users.createdAt} >= NOW() - INTERVAL '14 days'`)
      .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`);

    // Fill map for all last 14 days
    const signupsMap = {};
    for (const r of signupsRaw) {
      signupsMap[r.date] = r.count;
    }
    const signupsPerDay = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      signupsPerDay.push({
        date: key,
        count: signupsMap[key] || 0,
      });
    }

    const [auditLogCount] = await db
      .select({ total: sql`count(*)::int` })
      .from(auditLogs);

    // Recent 5 system actions
    const recentActivity = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(5);

    res.json({
      success: true,
      data: {
        users: {
          total: userCount?.total || 0,
          active: userCount?.active || 0,
          new7Days: userCount?.new7Days || 0,
          new30Days: userCount?.new30Days || 0,
        },
        groups: {
          total: groupCount?.total || 0,
          active: groupCount?.active || 0,
          settled: groupCount?.settled || 0,
          frozen: groupCount?.frozen || 0,
          deleted: groupCount?.deleted || 0,
        },
        expenses: {
          count: expenseStats?.totalCount || 0,
          volume: Number(expenseStats?.totalVolume || 0),
          voidedCount: expenseStats?.voidedCount || 0,
        },
        payments: {
          count: paymentStats?.totalCount || 0,
          acceptedVolume: Number(paymentStats?.acceptedVolume || 0),
          pendingCount: paymentStats?.pendingCount || 0,
          pendingVolume: Number(paymentStats?.pendingVolume || 0),
          pendingOlderCount: paymentStats?.pendingOlderCount || 0,
          pendingOlderVolume: Number(paymentStats?.pendingOlderVolume || 0),
          voidedCount: paymentStats?.voidedCount || 0,
        },
        overview: {
          totalUsers: userCount?.total || 0,
          newUsers7Days: userCount?.new7Days || 0,
          newUsers30Days: userCount?.new30Days || 0,
          activeGroups: groupCount?.active || 0,
          totalTracked: Number(expenseStats?.totalVolume || 0),
          totalPending: Number(paymentStats?.pendingVolume || 0),
          pendingAlertDays,
          pendingOlderCount: paymentStats?.pendingOlderCount || 0,
          pendingOlderVolume: Number(paymentStats?.pendingOlderVolume || 0),
          voidedRecords: (expenseStats?.voidedCount || 0) + (paymentStats?.voidedCount || 0),
          openResetRequests: openResets?.count || 0,
          adminActionsToday: actionsToday?.count || 0,
        },
        signupsPerDay,
        auditLogsTotal: auditLogCount?.total || 0,
        recentActivity,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List all users with search, filters (role, status, neverLoggedIn), and server-side pagination.
 */
export async function getUsers(req, res, next) {
  try {
    const { search, role, status, neverLoggedIn, page = 1, limit = 20 } = req.query;
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const conditions = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(users.name, term), ilike(users.username, term), ilike(users.email, term)));
    }

    if (role && (role === 'admin' || role === 'user')) {
      conditions.push(eq(users.role, role));
    }

    if (status === 'active') {
      conditions.push(eq(users.isActive, true));
    } else if (status === 'disabled') {
      conditions.push(eq(users.isActive, false));
    }

    if (neverLoggedIn === 'true' || neverLoggedIn === '1') {
      conditions.push(isNull(users.lastLoginAt));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(users)
      .where(whereClause);

    const userList = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        deactivatedReason: users.deactivatedReason,
        lastLoginAt: users.lastLoginAt,
        passwordChangedAt: users.passwordChangedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Augment with groups hosted and linked profiles counts
    const augmentedUsers = await Promise.all(
      userList.map(async (u) => {
        const [hosted] = await db
          .select({ count: sql`count(*)::int` })
          .from(groups)
          .where(and(eq(groups.createdBy, u.id), eq(groups.isDeleted, false)));

        const [linked] = await db
          .select({ count: sql`count(*)::int` })
          .from(people)
          .where(and(eq(people.linkedUserId, u.id), eq(people.isHost, false), eq(people.isDeleted, false)));

        return {
          ...u,
          groupsHosted: hosted?.count || 0,
          groupsLinked: linked?.count || 0,
        };
      })
    );

    res.json({
      success: true,
      data: {
        users: augmentedUsers,
        pagination: {
          total: countResult?.count || 0,
          page: parseInt(page, 10) || 1,
          limit: pageSize,
          totalPages: Math.ceil((countResult?.count || 0) / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get detailed profile for a specific user (drawer).
 */
export async function getUserDetail(req, res, next) {
  try {
    const { userId } = req.params;

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        passwordChangedAt: users.passwordChangedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    const groupsHosted = await db
      .select({
        id: groups.id,
        name: groups.name,
        status: groups.status,
        isFrozen: groups.isFrozen,
        createdAt: groups.createdAt,
      })
      .from(groups)
      .where(and(eq(groups.createdBy, userId), eq(groups.isDeleted, false)));

    const linkedProfiles = await db
      .select({
        id: people.id,
        groupId: people.groupId,
        groupName: groups.name,
        name: people.name,
        isHost: people.isHost,
        canViewAllBills: people.canViewAllBills,
      })
      .from(people)
      .innerJoin(groups, eq(people.groupId, groups.id))
      .where(and(eq(people.linkedUserId, userId), eq(people.isDeleted, false)));

    res.json({
      success: true,
      data: {
        user,
        groupsHosted,
        linkedProfiles,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Activate or deactivate a user account.
 * Sensitive action: requires reason & currentPassword.
 * Cannot disable self, and cannot disable the last active administrator.
 */
export async function toggleUserStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const { isActive, reason, currentPassword } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_SELF_DEACTIVATE',
          message: 'Administrators cannot deactivate their own account.',
        },
      });
    }

    const updated = await db.transaction(async (tx) => {
      const [targetUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!targetUser) {
        const error = new Error('User not found.');
        error.status = 404;
        error.code = 'USER_NOT_FOUND';
        throw error;
      }

      // If disabling an admin, ensure last active admin is not disabled
      if (targetUser.role === 'admin' && !isActive) {
        const activeAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'admin'), eq(users.isActive, true)))
          .for('update');

        if (activeAdmins.length <= 1 && activeAdmins.some((a) => a.id === userId)) {
          const error = new Error('Cannot disable the last active administrator.');
          error.status = 400;
          error.code = 'CANNOT_REMOVE_LAST_ADMIN';
          throw error;
        }
      }

      // Update isActive. If disabling, also increment tokenVersion to immediately revoke sessions
      const updateData = {
        isActive: Boolean(isActive),
        deactivatedReason: isActive ? null : reason.trim(),
      };
      if (!isActive) {
        updateData.tokenVersion = sql`${users.tokenVersion} + 1`;
      }

      const [updatedUser] = await tx
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          deactivatedReason: users.deactivatedReason,
        });

      await recordAuditLog(
        {
          actor: { id: req.user.id, role: 'admin', name: req.user.name },
          action: updatedUser.isActive ? 'admin.user.enable' : 'admin.user.disable',
          entityType: 'User',
          entityId: userId,
          reason: reason.trim(),
          before: { isActive: targetUser.isActive },
          after: { isActive: updatedUser.isActive },
          ipAddress: req.ip,
        },
        tx
      );

      return updatedUser;
    });

    res.json({
      success: true,
      message: `User account has been ${updated.isActive ? 'activated' : 'deactivated'}.`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Change user role (promote to admin or demote to user).
 * Sensitive action: requires reason & currentPassword.
 * Promoting deletes recovery codes and voids open resets in the same transaction.
 * Cannot demote self or the last active admin.
 */
export async function changeUserRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role, reason, currentPassword } = req.body;

    if (role !== 'admin' && role !== 'user') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ROLE', message: 'Role must be either "admin" or "user".' },
      });
    }

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    if (role === 'user' && userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_TARGET_SELF',
          message: 'Administrators cannot demote their own account.',
        },
      });
    }

    const updated = await db.transaction(async (tx) => {
      const [targetUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!targetUser) {
        const error = new Error('User not found.');
        error.status = 404;
        error.code = 'USER_NOT_FOUND';
        throw error;
      }

      // If demoting from admin, check last active admin
      if (targetUser.role === 'admin' && role === 'user') {
        const activeAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'admin'), eq(users.isActive, true)))
          .for('update');

        if (activeAdmins.length <= 1 && activeAdmins.some((a) => a.id === userId)) {
          const error = new Error('Cannot demote the last active administrator.');
          error.status = 400;
          error.code = 'CANNOT_REMOVE_LAST_ADMIN';
          throw error;
        }
      }

      // If promoting to admin: delete recovery codes and void open resets
      if (role === 'admin') {
        await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
        await tx
          .update(passwordResets)
          .set({ usedAt: new Date() })
          .where(and(eq(passwordResets.userId, userId), sql`${passwordResets.usedAt} IS NULL`));
      }

      const [updatedUser] = await tx
        .update(users)
        .set({ role })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
        });

      await recordAuditLog(
        {
          actor: { id: req.user.id, role: 'admin', name: req.user.name },
          action: 'admin.user.change_role',
          entityType: 'User',
          entityId: userId,
          reason: reason.trim(),
          before: { role: targetUser.role },
          after: { role: updatedUser.role },
          ipAddress: req.ip,
        },
        tx
      );

      return updatedUser;
    });

    res.json({
      success: true,
      message: `User role has been changed to ${updated.role}.`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Force sign-out a user across all sessions (tokenVersion++).
 * Sensitive action: requires reason & currentPassword.
 */
export async function forceSignOutUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { reason, currentPassword } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    const [targetUser] = await db
      .select({ id: users.id, tokenVersion: users.tokenVersion })
      .from(users)
      .where(eq(users.id, userId));

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    await db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId));

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.user.force_sign_out',
      entityType: 'User',
      entityId: userId,
      reason: reason.trim(),
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'User sessions invalidated successfully.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update user display name.
 * Usernames are PERMANENT and never editable.
 */
export async function updateUserDisplayName(req, res, next) {
  try {
    const { userId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'NAME_REQUIRED', message: 'A valid display name is required.' },
      });
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    const [updated] = await db
      .update(users)
      .set({ name: name.trim() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      });

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.user.update_name',
      entityType: 'User',
      entityId: userId,
      before: { name: targetUser.name },
      after: { name: updated.name },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'User name updated successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List all groups platform-wide, including soft-deleted, with filters and pagination.
 */
export async function getAdminGroups(req, res, next) {
  try {
    const { status, frozen, deleted, host, search, page = 1, limit = 20 } = req.query;
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const conditions = [];

    if (search && search.trim()) {
      conditions.push(ilike(groups.name, `%${search.trim()}%`));
    }

    if (status && (status === 'active' || status === 'settled')) {
      conditions.push(eq(groups.status, status));
    }

    if (frozen === 'true') {
      conditions.push(eq(groups.isFrozen, true));
    } else if (frozen === 'false') {
      conditions.push(eq(groups.isFrozen, false));
    }

    if (deleted === 'true') {
      conditions.push(eq(groups.isDeleted, true));
    } else if (deleted === 'false') {
      conditions.push(eq(groups.isDeleted, false));
    }

    if (host && host.trim()) {
      // Find matching users for host
      const matchingHosts = await db
        .select({ id: users.id })
        .from(users)
        .where(
          or(
            ilike(users.name, `%${host.trim()}%`),
            ilike(users.username, `%${host.trim()}%`),
            eq(users.id, host.trim())
          )
        );
      const hostIds = matchingHosts.map((h) => h.id);
      if (hostIds.length > 0) {
        conditions.push(sql`${groups.createdBy} IN ${hostIds}`);
      } else {
        conditions.push(sql`1 = 0`);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(groups)
      .where(whereClause);

    const groupList = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        status: groups.status,
        isFrozen: groups.isFrozen,
        frozenReason: groups.frozenReason,
        frozenAt: groups.frozenAt,
        isDeleted: groups.isDeleted,
        createdBy: groups.createdBy,
        createdAt: groups.createdAt,
        updatedAt: groups.updatedAt,
        hostName: users.name,
        hostUsername: users.username,
        hostEmail: users.email,
      })
      .from(groups)
      .innerJoin(users, eq(groups.createdBy, users.id))
      .where(whereClause)
      .orderBy(desc(groups.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Augment with members and expenses counts
    const augmentedGroups = await Promise.all(
      groupList.map(async (g) => {
        const [peopleCount] = await db
          .select({ count: sql`count(*)::int` })
          .from(people)
          .where(and(eq(people.groupId, g.id), eq(people.isDeleted, false)));

        const [expenseStats] = await db
          .select({
            count: sql`count(*)::int`,
            volume: sql`coalesce(sum(${expenses.totalAmount}), 0)::bigint`,
          })
          .from(expenses)
          .where(and(eq(expenses.groupId, g.id), eq(expenses.isDeleted, false)));

        return {
          ...g,
          memberCount: peopleCount?.count || 0,
          expenseCount: expenseStats?.count || 0,
          totalSpent: Number(expenseStats?.volume || 0),
        };
      })
    );

    res.json({
      success: true,
      data: {
        groups: augmentedGroups,
        pagination: {
          total: countResult?.count || 0,
          page: parseInt(page, 10) || 1,
          limit: pageSize,
          totalPages: Math.ceil((countResult?.count || 0) / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Detail view of a group with the full ledger (same data host sees).
 */
export async function getAdminGroupLedger(req, res, next) {
  try {
    const { groupId } = req.params;

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({
        success: false,
        error: { code: 'GROUP_NOT_FOUND', message: 'Group not found.' },
      });
    }

    const groupPeople = await db
      .select()
      .from(people)
      .where(and(eq(people.groupId, groupId), eq(people.isDeleted, false)));

    const groupExpenses = await db.query.expenses.findMany({
      where: and(eq(expenses.groupId, groupId), eq(expenses.isDeleted, false)),
      orderBy: [desc(expenses.date)],
      with: {
        splits: true,
      },
    });

    const groupPayments = await db
      .select()
      .from(payments)
      .where(and(eq(payments.groupId, groupId), eq(payments.isDeleted, false)))
      .orderBy(desc(payments.date));

    const balances = await calculateGroupBalances(groupId);

    res.json({
      success: true,
      data: {
        group,
        people: groupPeople,
        expenses: groupExpenses,
        payments: groupPayments,
        balances,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Freeze a group (dispute lock).
 * Sensitive action: requires reason & currentPassword.
 */
export async function freezeGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    const { reason, currentPassword } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({
        success: false,
        error: { code: 'GROUP_NOT_FOUND', message: 'Group not found.' },
      });
    }

    const [updated] = await db
      .update(groups)
      .set({
        isFrozen: true,
        frozenReason: reason.trim(),
        frozenAt: new Date(),
        frozenBy: req.user.id,
      })
      .where(eq(groups.id, groupId))
      .returning();

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.group.freeze',
      entityType: 'Group',
      entityId: groupId,
      groupId,
      reason: reason.trim(),
      before: { isFrozen: group.isFrozen },
      after: { isFrozen: true, frozenReason: reason.trim() },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Group has been frozen.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Unfreeze a frozen group.
 * Sensitive action: requires reason & currentPassword.
 */
export async function unfreezeGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    const { reason, currentPassword } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({
        success: false,
        error: { code: 'GROUP_NOT_FOUND', message: 'Group not found.' },
      });
    }

    const [updated] = await db
      .update(groups)
      .set({
        isFrozen: false,
        frozenReason: null,
        frozenAt: null,
        frozenBy: null,
      })
      .where(eq(groups.id, groupId))
      .returning();

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.group.unfreeze',
      entityType: 'Group',
      entityId: groupId,
      groupId,
      reason: reason.trim(),
      before: { isFrozen: group.isFrozen, frozenReason: group.frozenReason },
      after: { isFrozen: false },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Group has been unfrozen.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Reopen a settled group by admin.
 * Sensitive action: requires reason & currentPassword.
 */
export async function reopenGroupAdmin(req, res, next) {
  try {
    const { groupId } = req.params;
    const { reason, currentPassword } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({
        success: false,
        error: { code: 'GROUP_NOT_FOUND', message: 'Group not found.' },
      });
    }

    const [updated] = await db
      .update(groups)
      .set({ status: 'active' })
      .where(eq(groups.id, groupId))
      .returning();

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.group.reopen',
      entityType: 'Group',
      entityId: groupId,
      groupId,
      reason: reason.trim(),
      before: { status: group.status },
      after: { status: 'active' },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Group has been reopened.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Restore a soft-deleted group by admin.
 * Sensitive action: requires reason & currentPassword.
 */
export async function restoreGroupAdmin(req, res, next) {
  try {
    const { groupId } = req.params;
    const { reason, currentPassword } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({
        success: false,
        error: { code: 'GROUP_NOT_FOUND', message: 'Group not found.' },
      });
    }

    const [updated] = await db
      .update(groups)
      .set({ isDeleted: false })
      .where(eq(groups.id, groupId))
      .returning();

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.group.restore',
      entityType: 'Group',
      entityId: groupId,
      groupId,
      reason: reason.trim(),
      before: { isDeleted: group.isDeleted },
      after: { isDeleted: false },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Group has been restored.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Transfer host ownership to another user.
 * Sensitive action: requires reason & currentPassword.
 * Updates createdBy and the host person row's linkedUserId in one transaction.
 * Rejects if target user is already linked to a friend profile in that group.
 */
export async function transferGroupHost(req, res, next) {
  try {
    const { groupId } = req.params;
    const { newHostUserId, reason, currentPassword } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    if (!newHostUserId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_NEW_HOST', message: 'Target user ID is required.' },
      });
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, newHostUserId));

    if (!targetUser || !targetUser.isActive) {
      return res.status(404).json({
        success: false,
        error: { code: 'TARGET_USER_NOT_FOUND', message: 'Target user not found or inactive.' },
      });
    }

    const updated = await db.transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .for('update');

      if (!group) {
        const err = new Error('Group not found.');
        err.status = 404;
        err.code = 'GROUP_NOT_FOUND';
        throw err;
      }

      if (group.createdBy === newHostUserId) {
        const err = new Error('User is already the host of this group.');
        err.status = 400;
        err.code = 'ALREADY_HOST';
        throw err;
      }

      // Check if target user is already a friend member in this group
      const [existingFriend] = await tx
        .select()
        .from(people)
        .where(
          and(
            eq(people.groupId, groupId),
            eq(people.linkedUserId, newHostUserId),
            eq(people.isHost, false),
            eq(people.isDeleted, false)
          )
        );

      if (existingFriend) {
        const err = new Error('Target user is already linked to a member profile in this group.');
        err.status = 400;
        err.code = 'TARGET_ALREADY_MEMBER';
        throw err;
      }

      // Find the host person row
      const [hostPerson] = await tx
        .select()
        .from(people)
        .where(
          and(
            eq(people.groupId, groupId),
            eq(people.isHost, true),
            eq(people.isDeleted, false)
          )
        );

      // Update group createdBy
      const [updatedGroup] = await tx
        .update(groups)
        .set({ createdBy: newHostUserId })
        .where(eq(groups.id, groupId))
        .returning();

      // Update host person row
      if (hostPerson) {
        await tx
          .update(people)
          .set({
            linkedUserId: newHostUserId,
            name: targetUser.name,
          })
          .where(eq(people.id, hostPerson.id));
      }

      await recordAuditLog(
        {
          actor: { id: req.user.id, role: 'admin', name: req.user.name },
          action: 'admin.group.transfer_host',
          entityType: 'Group',
          entityId: groupId,
          groupId,
          reason: reason.trim(),
          before: { createdBy: group.createdBy },
          after: { createdBy: newHostUserId },
          ipAddress: req.ip,
        },
        tx
      );

      return updatedGroup;
    });

    res.json({
      success: true,
      message: 'Host ownership transferred successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all system settings.
 */
export async function getAdminSettings(req, res, next) {
  try {
    const settings = await getAllSettings();
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update system settings.
 * Sensitive action: requires reason & currentPassword.
 * Validates strictly with zod schema.
 */
export async function updateAdminSettings(req, res, next) {
  try {
    const { settings: newSettings, reason, currentPassword } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    // Validate with zod .strict()
    const parseResult = settingsUpdateSchema.safeParse(newSettings);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid settings payload or non-whitelisted keys supplied.',
          details: parseResult.error.errors,
        },
      });
    }

    const validated = parseResult.data;
    const beforeSettings = await getAllSettings();

    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(validated)) {
        await tx
          .insert(systemSettings)
          .values({
            key,
            value,
            updatedBy: req.user.id,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: {
              value,
              updatedBy: req.user.id,
              updatedAt: new Date(),
            },
          });
      }

      await recordAuditLog(
        {
          actor: { id: req.user.id, role: 'admin', name: req.user.name },
          action: 'admin.settings.update',
          entityType: 'SystemSettings',
          entityId: req.user.id,
          reason: reason.trim(),
          before: beforeSettings,
          after: { ...beforeSettings, ...validated },
          ipAddress: req.ip,
        },
        tx
      );
    });

    const updated = await getAllSettings();

    res.json({
      success: true,
      message: 'System settings updated successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Query immutable audit logs with flexible filtering and pagination.
 */
export async function getAuditLogs(req, res, next) {
  try {
    const {
      action,
      actionPrefix,
      entityType,
      actorUserId,
      actorRole,
      groupId,
      adminOnly,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const conditions = [];

    if (action && action.trim()) {
      conditions.push(eq(auditLogs.action, action.trim()));
    }
    if (actionPrefix && actionPrefix.trim()) {
      conditions.push(ilike(auditLogs.action, `${actionPrefix.trim()}%`));
    }
    if (entityType && entityType.trim()) {
      conditions.push(eq(auditLogs.entityType, entityType.trim()));
    }
    if (actorUserId && actorUserId.trim()) {
      conditions.push(eq(auditLogs.actorUserId, actorUserId.trim()));
    }
    if (actorRole && actorRole.trim()) {
      conditions.push(eq(auditLogs.actorRole, actorRole.trim()));
    }
    if (groupId && groupId.trim()) {
      conditions.push(eq(auditLogs.groupId, groupId.trim()));
    }
    if (adminOnly === 'true' || adminOnly === true) {
      conditions.push(
        or(
          eq(auditLogs.actorRole, 'admin'),
          ilike(auditLogs.action, 'admin.%')
        )
      );
    }
    if (startDate) {
      conditions.push(sql`${auditLogs.createdAt} >= ${new Date(startDate)}`);
    }
    if (endDate) {
      conditions.push(sql`${auditLogs.createdAt} <= ${new Date(endDate)}`);
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(auditLogs.action, term),
          ilike(auditLogs.actorName, term),
          ilike(auditLogs.reason, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(auditLogs)
      .where(whereClause);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total: countResult?.count || 0,
          page: parseInt(page, 10) || 1,
          limit: pageSize,
          totalPages: Math.ceil((countResult?.count || 0) / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lists password reset requests with user metrics and open badge count.
 */
export async function getResetRequests(req, res, next) {
  try {
    const statusFilter = req.query.status || 'open';

    const conditions = [];
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(resetRequests.status, statusFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rawRequests = await db
      .select({
        id: resetRequests.id,
        userId: resetRequests.userId,
        userNote: resetRequests.note,
        status: resetRequests.status,
        handledBy: resetRequests.handledBy,
        handledAt: resetRequests.handledAt,
        createdAt: resetRequests.createdAt,
        userName: users.name,
        userUsername: users.username,
        userEmail: users.email,
        userPhone: users.phone,
        userLastLoginAt: users.lastLoginAt,
      })
      .from(resetRequests)
      .innerJoin(users, eq(resetRequests.userId, users.id))
      .where(whereClause)
      .orderBy(desc(resetRequests.createdAt));

    const requests = await Promise.all(
      rawRequests.map(async (r) => {
        const [hosted] = await db
          .select({ count: sql`count(*)::int` })
          .from(groups)
          .where(and(eq(groups.createdBy, r.userId), eq(groups.isDeleted, false)));

        const [linked] = await db
          .select({ count: sql`count(*)::int` })
          .from(people)
          .where(and(eq(people.linkedUserId, r.userId), eq(people.isHost, false), eq(people.isDeleted, false)));

        return {
          id: r.id,
          userId: r.userId,
          name: r.userName,
          username: r.userUsername,
          email: r.userEmail,
          phone: r.userPhone,
          lastLoginAt: r.userLastLoginAt,
          note: r.userNote,
          status: r.status,
          createdAt: r.createdAt,
          groupsHosted: hosted?.count || 0,
          groupsLinked: linked?.count || 0,
        };
      })
    );

    const [openCount] = await db
      .select({ count: sql`count(*)::int` })
      .from(resetRequests)
      .where(eq(resetRequests.status, 'open'));

    res.json({
      success: true,
      data: {
        requests,
        openCount: openCount?.count || 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Dismisses an open reset request.
 */
export async function dismissResetRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [reqRow] = await db
      .select()
      .from(resetRequests)
      .where(eq(resetRequests.id, id));

    if (!reqRow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Reset request not found.' },
      });
    }

    await db
      .update(resetRequests)
      .set({
        status: 'dismissed',
        handledBy: req.user.id,
        handledAt: new Date(),
      })
      .where(eq(resetRequests.id, id));

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.reset_request.dismiss',
      entityType: 'ResetRequest',
      entityId: id,
      reason: reason || 'dismissed by admin',
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Reset request dismissed.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Generates a single-use reset credential (link + short code).
 * Sensitive action: Requires reason and current admin password.
 * Rejects admin targets (403). Returns plain values ONCE.
 */
export async function generateResetCredential(req, res, next) {
  try {
    const targetUserId = req.params.id;
    const { reason, currentPassword, expiresInHours = 1, requestId } = req.body;

    await verifyAdminSensitiveAction(req.user, currentPassword, reason, req.ip);

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId));

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'Target user not found.' },
      });
    }

    if (targetUser.role === 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin passwords can only be reset from the server CLI.',
        },
      });
    }

    const hours = Math.min(24, Math.max(1, parseInt(expiresInHours, 10) || 1));
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const plainToken = generateResetToken();
    const tokenHash = hashResetToken(plainToken);

    const rawCode = generateRawCode();
    const formattedCode = formatCode(rawCode);
    const codeHash = hashRecoveryCode(rawCode);

    await db.transaction(async (tx) => {
      await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResets.userId, targetUser.id),
            sql`${passwordResets.usedAt} IS NULL`
          )
        );

      await tx.insert(passwordResets).values({
        userId: targetUser.id,
        tokenHash,
        codeHash,
        expiresAt,
        createdByAdminId: req.user.id,
        requestId: requestId || null,
      });

      if (requestId) {
        await tx
          .update(resetRequests)
          .set({
            status: 'fulfilled',
            handledBy: req.user.id,
            handledAt: new Date(),
          })
          .where(eq(resetRequests.id, requestId));
      }

      await recordAuditLog(
        {
          actor: { id: req.user.id, role: 'admin', name: req.user.name },
          action: 'admin.user.generate_reset_credential',
          entityType: 'User',
          entityId: targetUser.id,
          reason: reason.trim(),
          ipAddress: req.ip,
        },
        tx
      );
    });

    const link = buildResetUrl(plainToken);

    const formattedExpiry = expiresAt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const whatsappMessage = `Hi ${targetUser.name}, here is your password reset link for SplitOrbit (username: @${targetUser.username}):\n\nLink: ${link}\nOr reset code: ${formattedCode}\n\nExpires in ${hours} hour(s) on ${formattedExpiry}. Choose your new password.`;

    res.json({
      success: true,
      data: {
        username: targetUser.username,
        link,
        code: formattedCode,
        expiresAt: expiresAt.toISOString(),
        whatsappMessage,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Runs DB integrity check with 1/min rate limit.
 */
export async function runIntegrity(req, res, next) {
  try {
    const lastReport = await getLatestIntegrityReport();
    if (lastReport && lastReport.checkedAt) {
      const elapsedMs = Date.now() - new Date(lastReport.checkedAt).getTime();
      if (elapsedMs < 60000) {
        const waitSec = Math.ceil((60000 - elapsedMs) / 1000);
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Integrity check ran recently. Please wait ${waitSec}s before running again.`,
          },
        });
      }
    }

    const report = await runIntegrityCheck(req.user.id);
    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.integrity.run',
      entityType: 'IntegrityReport',
      entityId: report.id,
      reason: `Integrity status: ${report.status}, ${report.issues.length} issues`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Gets the latest DB integrity report.
 */
export async function getIntegrityReport(req, res, next) {
  try {
    const report = await getLatestIntegrityReport();
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lists people with active share links or invites.
 */
export async function getAdminShareLinks(req, res, next) {
  try {
    const { groupId, search, page = 1, limit = 50 } = req.query;
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const conditions = [
      eq(people.isDeleted, false),
      or(sql`${people.shareTokenHash} IS NOT NULL`, sql`${people.inviteCodeHash} IS NOT NULL`),
    ];

    if (groupId && groupId.trim()) {
      conditions.push(eq(people.groupId, groupId.trim()));
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(people.name, term), ilike(groups.name, term)));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(people)
      .innerJoin(groups, eq(people.groupId, groups.id))
      .where(whereClause);

    const rows = await db
      .select({
        id: people.id,
        groupId: people.groupId,
        groupName: groups.name,
        personName: people.name,
        phone: people.phone,
        isHost: people.isHost,
        linkedUserId: people.linkedUserId,
        linkedUsername: users.username,
        shareEnabled: people.shareEnabled,
        hasShareLink: sql`CASE WHEN ${people.shareTokenHash} IS NOT NULL THEN true ELSE false END`.mapWith(Boolean),
        hasInvite: sql`CASE WHEN ${people.inviteCodeHash} IS NOT NULL THEN true ELSE false END`.mapWith(Boolean),
        inviteExpiresAt: people.inviteExpiresAt,
        lastViewedAt: people.lastViewedAt,
        createdAt: people.createdAt,
      })
      .from(people)
      .innerJoin(groups, eq(people.groupId, groups.id))
      .leftJoin(users, eq(people.linkedUserId, users.id))
      .where(whereClause)
      .orderBy(desc(people.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const now = new Date();
    const formatted = rows.map((r) => {
      let status = 'active';
      if (r.linkedUserId) {
        status = 'claimed';
      } else if (r.inviteExpiresAt && new Date(r.inviteExpiresAt) < now) {
        status = 'expired';
      } else if (!r.shareEnabled && !r.hasInvite) {
        status = 'revoked';
      }
      return {
        ...r,
        status,
      };
    });

    res.json({
      success: true,
      data: {
        links: formatted,
        pagination: {
          total: countResult?.count || 0,
          page: parseInt(page, 10) || 1,
          limit: pageSize,
          totalPages: Math.ceil((countResult?.count || 0) / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Revokes a single person's share link and invite.
 */
export async function revokeShareLink(req, res, next) {
  try {
    const { personId } = req.params;
    const { reason, password } = req.body;

    await verifyAdminSensitiveAction(req.user.id, { reason, password }, req.ip);

    const [target] = await db
      .select()
      .from(people)
      .where(eq(people.id, personId));

    if (!target) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Person not found.' },
      });
    }

    const [updated] = await db
      .update(people)
      .set({
        shareEnabled: false,
        shareTokenHash: null,
        inviteCodeHash: null,
        inviteExpiresAt: null,
      })
      .where(eq(people.id, personId))
      .returning();

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.share_link.revoke',
      entityType: 'Person',
      entityId: personId,
      groupId: target.groupId,
      reason: reason.trim(),
      before: { shareEnabled: target.shareEnabled, hasToken: !!target.shareTokenHash, hasInvite: !!target.inviteCodeHash },
      after: { shareEnabled: false, hasToken: false, hasInvite: false },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Share link and invite revoked successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Revokes all share links and invites across a group.
 */
export async function revokeGroupShareLinks(req, res, next) {
  try {
    const { groupId } = req.params;
    const { reason, password } = req.body;

    await verifyAdminSensitiveAction(req.user.id, { reason, password }, req.ip);

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Group not found.' },
      });
    }

    await db
      .update(people)
      .set({
        shareEnabled: false,
        shareTokenHash: null,
        inviteCodeHash: null,
        inviteExpiresAt: null,
      })
      .where(eq(people.groupId, groupId));

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: 'admin.share_link.revoke_all',
      entityType: 'Group',
      entityId: groupId,
      reason: reason.trim(),
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'All share links and invites in the group were revoked.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Global expenses oversight with filters.
 */
export async function getAdminExpenses(req, res, next) {
  try {
    const {
      groupId,
      hostId,
      search,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      isDeleted,
      page = 1,
      limit = 50,
    } = req.query;

    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const conditions = [];

    if (groupId && groupId.trim()) {
      conditions.push(eq(expenses.groupId, groupId.trim()));
    }
    if (hostId && hostId.trim()) {
      conditions.push(eq(groups.createdBy, hostId.trim()));
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(expenses.title, term), ilike(expenses.description, term)));
    }
    if (minAmount !== undefined && minAmount !== '') {
      conditions.push(sql`${expenses.totalAmount} >= ${parseInt(minAmount, 10)}`);
    }
    if (maxAmount !== undefined && maxAmount !== '') {
      conditions.push(sql`${expenses.totalAmount} <= ${parseInt(maxAmount, 10)}`);
    }
    if (startDate) {
      conditions.push(sql`${expenses.date} >= ${new Date(startDate)}`);
    }
    if (endDate) {
      conditions.push(sql`${expenses.date} <= ${new Date(endDate)}`);
    }
    if (isDeleted === 'true') {
      conditions.push(eq(expenses.isDeleted, true));
    } else if (isDeleted === 'false') {
      conditions.push(eq(expenses.isDeleted, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(expenses)
      .innerJoin(groups, eq(expenses.groupId, groups.id))
      .where(whereClause);

    const rows = await db
      .select({
        id: expenses.id,
        groupId: expenses.groupId,
        groupName: groups.name,
        title: expenses.title,
        totalAmount: expenses.totalAmount,
        date: expenses.date,
        paidByPersonId: expenses.paidByPersonId,
        paidByName: people.name,
        description: expenses.description,
        splitType: expenses.splitType,
        createdBy: expenses.createdBy,
        isDeleted: expenses.isDeleted,
        createdAt: expenses.createdAt,
      })
      .from(expenses)
      .innerJoin(groups, eq(expenses.groupId, groups.id))
      .innerJoin(people, eq(expenses.paidByPersonId, people.id))
      .where(whereClause)
      .orderBy(desc(expenses.createdAt))
      .limit(pageSize)
      .offset(offset);

    res.json({
      success: true,
      data: {
        expenses: rows,
        pagination: {
          total: countResult?.count || 0,
          page: parseInt(page, 10) || 1,
          limit: pageSize,
          totalPages: Math.ceil((countResult?.count || 0) / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Global payments oversight with filters and pending-too-long queue.
 */
export async function getAdminPayments(req, res, next) {
  try {
    const {
      groupId,
      hostId,
      status,
      mode,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      isDeleted,
      pendingTooLong,
      page = 1,
      limit = 50,
    } = req.query;

    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const conditions = [];

    if (groupId && groupId.trim()) {
      conditions.push(eq(payments.groupId, groupId.trim()));
    }
    if (hostId && hostId.trim()) {
      conditions.push(eq(groups.createdBy, hostId.trim()));
    }
    if (status && status.trim()) {
      conditions.push(eq(payments.status, status.trim()));
    }
    if (mode && mode.trim()) {
      conditions.push(eq(payments.mode, mode.trim()));
    }
    if (minAmount !== undefined && minAmount !== '') {
      conditions.push(sql`${payments.amount} >= ${parseInt(minAmount, 10)}`);
    }
    if (maxAmount !== undefined && maxAmount !== '') {
      conditions.push(sql`${payments.amount} <= ${parseInt(maxAmount, 10)}`);
    }
    if (startDate) {
      conditions.push(sql`${payments.date} >= ${new Date(startDate)}`);
    }
    if (endDate) {
      conditions.push(sql`${payments.date} <= ${new Date(endDate)}`);
    }
    if (isDeleted === 'true') {
      conditions.push(eq(payments.isDeleted, true));
    } else if (isDeleted === 'false') {
      conditions.push(eq(payments.isDeleted, false));
    }

    if (pendingTooLong === 'true' || pendingTooLong === true) {
      const pendingAlertDays = await getSetting('pendingAlertDays');
      const threshold = new Date(Date.now() - pendingAlertDays * 24 * 60 * 60 * 1000);
      conditions.push(
        and(
          eq(payments.status, 'pending'),
          eq(payments.isDeleted, false),
          sql`${payments.createdAt} <= ${threshold}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(payments)
      .innerJoin(groups, eq(payments.groupId, groups.id))
      .where(whereClause);

    const rows = await db.execute(sql`
      SELECT 
        pm.id,
        pm.group_id as "groupId",
        g.name as "groupName",
        g.created_by as "hostUserId",
        u.name as "hostName",
        pm.from_person_id as "fromPersonId",
        fp.name as "fromPersonName",
        pm.to_person_id as "toPersonId",
        tp.name as "toPersonName",
        pm.amount,
        pm.mode,
        pm.status,
        pm.reference,
        pm.description,
        pm.reject_reason as "rejectReason",
        pm.created_by_type as "createdByType",
        pm.is_deleted as "isDeleted",
        pm.date,
        pm.created_at as "createdAt",
        ROUND(EXTRACT(EPOCH FROM (NOW() - pm.created_at)) / 86400)::int as "ageDays"
      FROM payments pm
      JOIN groups g ON g.id = pm.group_id
      JOIN users u ON u.id = g.created_by
      JOIN people fp ON fp.id = pm.from_person_id
      JOIN people tp ON tp.id = pm.to_person_id
      ${whereClause ? sql`WHERE ${whereClause}` : sql``}
      ORDER BY pm.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset};
    `);

    res.json({
      success: true,
      data: {
        payments: rows.rows || rows,
        pagination: {
          total: countResult?.count || 0,
          page: parseInt(page, 10) || 1,
          limit: pageSize,
          totalPages: Math.ceil((countResult?.count || 0) / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin override: edit, void, restore expense.
 */
export async function overrideExpense(req, res, next) {
  try {
    const { id } = req.params;
    const { action, title, totalAmount, reason, password } = req.body;

    if (!['edit', 'void', 'restore'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'Action must be edit, void, or restore.' },
      });
    }

    await verifyAdminSensitiveAction(req.user.id, { reason, password }, req.ip);

    const [existing] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id));

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Expense not found.' },
      });
    }

    let updated;
    await db.transaction(async (tx) => {
      if (action === 'void') {
        [updated] = await tx
          .update(expenses)
          .set({ isDeleted: true })
          .where(eq(expenses.id, id))
          .returning();
      } else if (action === 'restore') {
        [updated] = await tx
          .update(expenses)
          .set({ isDeleted: false })
          .where(eq(expenses.id, id))
          .returning();
      } else if (action === 'edit') {
        const newTotal = totalAmount !== undefined ? parseInt(totalAmount, 10) : existing.totalAmount;
        [updated] = await tx
          .update(expenses)
          .set({
            title: title ? title.trim() : existing.title,
            totalAmount: newTotal,
          })
          .where(eq(expenses.id, id))
          .returning();

        if (totalAmount !== undefined && newTotal !== existing.totalAmount) {
          const splits = await tx
            .select()
            .from(expenseSplits)
            .where(eq(expenseSplits.expenseId, id));

          if (splits.length > 0) {
            const baseAmount = Math.floor(newTotal / splits.length);
            const remainder = newTotal % splits.length;

            for (let i = 0; i < splits.length; i++) {
              const allocated = baseAmount + (i < remainder ? 1 : 0);
              await tx
                .update(expenseSplits)
                .set({ amount: allocated })
                .where(eq(expenseSplits.id, splits[i].id));
            }
          }
        }
      }

      await recordAuditLog(
        {
          actor: { id: req.user.id, role: 'admin', name: 'Admin' },
          action: `admin.expense.override_${action}`,
          entityType: 'Expense',
          entityId: id,
          groupId: existing.groupId,
          reason: reason.trim(),
          before: existing,
          after: updated,
          ipAddress: req.ip,
        },
        tx
      );
    });

    res.json({
      success: true,
      message: `Expense ${action}ed successfully.`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin override: edit, void, restore payment.
 */
export async function overridePayment(req, res, next) {
  try {
    const { id } = req.params;
    const { action, amount, status, mode, reason, password } = req.body;

    if (!['edit', 'void', 'restore'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'Action must be edit, void, or restore.' },
      });
    }

    await verifyAdminSensitiveAction(req.user.id, { reason, password }, req.ip);

    const [existing] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, id));

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payment not found.' },
      });
    }

    let updated;
    await db.transaction(async (tx) => {
      if (action === 'void') {
        [updated] = await tx
          .update(payments)
          .set({ isDeleted: true })
          .where(eq(payments.id, id))
          .returning();
      } else if (action === 'restore') {
        [updated] = await tx
          .update(payments)
          .set({ isDeleted: false })
          .where(eq(payments.id, id))
          .returning();
      } else if (action === 'edit') {
        const updateData = {};
        if (amount !== undefined) updateData.amount = parseInt(amount, 10);
        if (status) updateData.status = status;
        if (mode) updateData.mode = mode;

        [updated] = await tx
          .update(payments)
          .set(updateData)
          .where(eq(payments.id, id))
          .returning();
      }

      await recordAuditLog(
        {
          actor: { id: req.user.id, role: 'admin', name: 'Admin' },
          action: `admin.payment.override_${action}`,
          entityType: 'Payment',
          entityId: id,
          groupId: existing.groupId,
          reason: reason.trim(),
          before: existing,
          after: updated,
          ipAddress: req.ip,
        },
        tx
      );
    });

    res.json({
      success: true,
      message: `Payment ${action}ed successfully.`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '';
  let str = val instanceof Date ? val.toISOString() : (typeof val === 'object' ? JSON.stringify(val) : String(val));
  // Neutralize formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * CSV Export for users, groups, payments, expenses, audit logs.
 * Admin password verified & audited.
 */
export async function exportEntity(req, res, next) {
  try {
    const { entity } = req.params;
    const { password, reason = 'CSV Export' } = req.body;

    if (!['users', 'groups', 'payments', 'expenses', 'audit'].includes(entity)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ENTITY', message: 'Entity must be users, groups, payments, expenses, or audit.' },
      });
    }

    await verifyAdminSensitiveAction(req.user.id, { reason, password }, req.ip);

    await recordAuditLog({
      actor: { id: req.user.id, role: 'admin', name: req.user.name },
      action: `admin.export.${entity}`,
      entityType: 'System',
      entityId: req.user.id,
      reason: reason.trim(),
      ipAddress: req.ip,
    });

    let headers = [];
    let rows = [];

    if (entity === 'users') {
      headers = ['id', 'name', 'username', 'email', 'phone', 'role', 'is_active', 'upi_id', 'created_at', 'last_login_at'];
      const data = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          phone: users.phone,
          role: users.role,
          is_active: users.isActive,
          upi_id: users.upiId,
          created_at: users.createdAt,
          last_login_at: users.lastLoginAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
      rows = data.map((r) => [r.id, r.name, r.username, r.email, r.phone, r.role, r.is_active, r.upi_id, r.created_at, r.last_login_at]);
    } else if (entity === 'groups') {
      headers = ['id', 'name', 'status', 'is_frozen', 'frozen_reason', 'created_by', 'created_at', 'is_deleted'];
      const data = await db
        .select({
          id: groups.id,
          name: groups.name,
          status: groups.status,
          is_frozen: groups.isFrozen,
          frozen_reason: groups.frozenReason,
          created_by: groups.createdBy,
          created_at: groups.createdAt,
          is_deleted: groups.isDeleted,
        })
        .from(groups)
        .orderBy(desc(groups.createdAt));
      rows = data.map((r) => [r.id, r.name, r.status, r.is_frozen, r.frozen_reason, r.created_by, r.created_at, r.is_deleted]);
    } else if (entity === 'payments') {
      headers = ['id', 'group_id', 'from_person_id', 'to_person_id', 'amount_in_rupees', 'mode', 'status', 'reference', 'created_by_type', 'date', 'created_at', 'is_deleted'];
      const data = await db
        .select()
        .from(payments)
        .orderBy(desc(payments.createdAt));
      rows = data.map((r) => [r.id, r.groupId, r.fromPersonId, r.toPersonId, (r.amount / 100).toFixed(2), r.mode, r.status, r.reference, r.createdByType, r.date, r.createdAt, r.isDeleted]);
    } else if (entity === 'expenses') {
      headers = ['id', 'group_id', 'title', 'total_amount_in_rupees', 'paid_by_person_id', 'split_type', 'date', 'created_at', 'is_deleted'];
      const data = await db
        .select()
        .from(expenses)
        .orderBy(desc(expenses.createdAt));
      rows = data.map((r) => [r.id, r.groupId, r.title, (r.totalAmount / 100).toFixed(2), r.paidByPersonId, r.splitType, r.date, r.createdAt, r.isDeleted]);
    } else if (entity === 'audit') {
      headers = ['id', 'actor_role', 'actor_name', 'action', 'entity_type', 'entity_id', 'group_id', 'reason', 'ip_address', 'created_at'];
      const data = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt));
      rows = data.map((r) => [r.id, r.actorRole, r.actorName, r.action, r.entityType, r.entityId, r.groupId, r.reason, r.ipAddress, r.createdAt]);
    }

    const csvLines = [];
    csvLines.push(headers.map(sanitizeCsvCell).join(','));
    for (const row of rows) {
      csvLines.push(row.map(sanitizeCsvCell).join(','));
    }

    const csvString = csvLines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="splittrack_${entity}_export_${Date.now()}.csv"`);
    res.send(csvString);
  } catch (error) {
    next(error);
  }
}

