import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { people, groups, users } from '../models/index.js';
import { generateSecureToken, hashToken } from '../services/tokenService.js';
import { recordAuditLog } from '../services/auditService.js';
import { buildInviteUrl } from '../utils/urlHelper.js';

/**
 * Host generates a Level 2 single-use invite code for a person.
 */
export async function generateInviteCode(req, res, next) {
  try {
    const { groupId, personId } = req.params;

    const [person] = await db
      .select()
      .from(people)
      .where(
        and(
          eq(people.id, personId),
          eq(people.groupId, groupId),
          eq(people.isDeleted, false)
        )
      );

    if (!person) {
      return res.status(404).json({
        success: false,
        error: { code: 'PERSON_NOT_FOUND', message: 'Person not found.' },
      });
    }

    if (person.isHost) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_INVITE_HOST', message: 'The host profile is already linked.' },
      });
    }

    if (person.linkedUserId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_CLAIMED',
          message: 'This person profile has already been claimed by a user account.',
        },
      });
    }

    const rawCode = generateSecureToken();
    const codeHash = hashToken(rawCode);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db
      .update(people)
      .set({
        inviteCodeHash: codeHash,
        inviteExpiresAt: expiresAt,
      })
      .where(eq(people.id, personId));

    await recordAuditLog({
      actor: req.user,
      action: 'GENERATE_INVITE_CODE',
      entityType: 'Person',
      entityId: personId,
      groupId,
      after: { inviteExpiresAt: expiresAt },
      ipAddress: req.ip,
    });

    const inviteUrl = buildInviteUrl(rawCode);

    res.json({
      success: true,
      data: {
        rawCode,
        inviteUrl,
        expiresAt,
        message: 'Invite link generated. Valid for 7 days and single-use only.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Public preview of an invite code before claiming.
 * GET /api/invites/:code/preview (and /api/invite/:code/preview)
 * Never leaks IDs, balances, or private data.
 */
export async function previewInviteCode(req, res, next) {
  try {
    const { code } = req.params;
    if (!code || typeof code !== 'string') {
      return res.json({
        success: true,
        data: { valid: false, reason: 'invalid' },
      });
    }

    const codeHash = hashToken(code.trim());

    const [person] = await db
      .select({
        id: people.id,
        name: people.name,
        groupId: people.groupId,
        linkedUserId: people.linkedUserId,
        inviteExpiresAt: people.inviteExpiresAt,
        isDeleted: people.isDeleted,
      })
      .from(people)
      .where(eq(people.inviteCodeHash, codeHash));

    if (!person) {
      return res.json({
        success: true,
        data: { valid: false, reason: 'invalid' },
      });
    }

    if (person.isDeleted) {
      return res.json({
        success: true,
        data: { valid: false, reason: 'revoked' },
      });
    }

    if (person.linkedUserId) {
      return res.json({
        success: true,
        data: { valid: false, reason: 'used' },
      });
    }

    if (person.inviteExpiresAt && new Date(person.inviteExpiresAt) < new Date()) {
      return res.json({
        success: true,
        data: { valid: false, reason: 'expired' },
      });
    }

    const [group] = await db
      .select({
        id: groups.id,
        name: groups.name,
        createdBy: groups.createdBy,
        isDeleted: groups.isDeleted,
      })
      .from(groups)
      .where(eq(groups.id, person.groupId));

    if (!group || group.isDeleted) {
      return res.json({
        success: true,
        data: { valid: false, reason: 'revoked' },
      });
    }

    const [hostUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, group.createdBy));

    return res.json({
      success: true,
      data: {
        valid: true,
        groupName: group.name,
        hostName: hostUser?.name || 'Group Host',
        profileLabel: person.name,
        expiresAt: person.inviteExpiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Backward-compatible public inspection of an invite code.
 * GET /api/invite/:code
 */
export async function getInviteDetails(req, res, next) {
  try {
    const { code } = req.params;
    const codeHash = hashToken(code.trim());

    const [person] = await db
      .select({
        id: people.id,
        groupId: people.groupId,
        name: people.name,
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

    if (!person || person.linkedUserId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'INVITE_INVALID',
          message: 'This invite link is invalid, already claimed, or expired.',
        },
      });
    }

    if (person.inviteExpiresAt && new Date(person.inviteExpiresAt) < new Date()) {
      return res.status(410).json({
        success: false,
        error: { code: 'INVITE_EXPIRED', message: 'This invite link has expired.' },
      });
    }

    const [group] = await db
      .select({ id: groups.id, name: groups.name, description: groups.description, createdBy: groups.createdBy })
      .from(groups)
      .where(eq(groups.id, person.groupId));

    const [hostUser] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, group?.createdBy));

    res.json({
      success: true,
      data: {
        valid: true,
        personName: person.name,
        profileLabel: person.name,
        groupName: group?.name || 'Group',
        groupDescription: group?.description || '',
        hostName: hostUser?.name || 'Group Host',
        expiresAt: person.inviteExpiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Claim profile via invite code (Atomic row-locked, idempotent execution).
 * POST /api/invites/:code/claim (and /api/invite/:code/claim, /api/invite/:code/accept)
 */
export async function claimInviteCode(req, res, next) {
  try {
    const { code } = req.params;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVITE_INVALID', message: 'Invite code is required.' },
      });
    }

    const codeHash = hashToken(code.trim());
    const userId = req.user.id;

    const result = await db.transaction(async (tx) => {
      // 1. Row-lock target person record
      const [person] = await tx
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
        .where(eq(people.inviteCodeHash, codeHash))
        .for('update');

      if (!person || person.isDeleted) {
        throw {
          status: 404,
          code: 'INVITE_INVALID',
          message: 'Invite link is invalid or no longer exists.',
        };
      }

      const [group] = await tx
        .select({
          id: groups.id,
          name: groups.name,
          createdBy: groups.createdBy,
          isDeleted: groups.isDeleted,
        })
        .from(groups)
        .where(eq(groups.id, person.groupId));

      if (!group || group.isDeleted) {
        throw {
          status: 404,
          code: 'INVITE_INVALID',
          message: 'The associated group no longer exists.',
        };
      }

      // Check expiration
      if (person.inviteExpiresAt && new Date(person.inviteExpiresAt) < new Date()) {
        throw {
          status: 410,
          code: 'INVITE_EXPIRED',
          message: 'This invite link has expired.',
        };
      }

      // Check if already claimed
      if (person.linkedUserId) {
        if (person.linkedUserId === userId) {
          return {
            alreadyClaimed: true,
            groupId: person.groupId,
            personId: person.id,
            groupName: group.name,
            linkedUserId: userId,
            inviteCodeHash: null,
          };
        }
        throw {
          status: 409,
          code: 'INVITE_USED',
          message: 'This invite has already been claimed by another user.',
        };
      }

      // Group hosts cannot claim a member profile
      if (person.isHost || group.createdBy === userId) {
        throw {
          status: 409,
          code: 'HOST_CANNOT_CLAIM',
          message: 'Group hosts cannot claim a member profile.',
        };
      }

      // Enforce one profile per user per group
      const [alreadyInGroup] = await tx
        .select({ id: people.id })
        .from(people)
        .where(
          and(
            eq(people.groupId, person.groupId),
            eq(people.linkedUserId, userId),
            eq(people.isDeleted, false)
          )
        );

      if (alreadyInGroup) {
        throw {
          status: 409,
          code: 'ALREADY_IN_GROUP',
          message: 'Your account is already linked to a profile in this group.',
          personId: alreadyInGroup.id,
        };
      }

      // Atomic update with WHERE linked_user_id IS NULL race protection
      const [claimedPerson] = await tx
        .update(people)
        .set({
          linkedUserId: userId,
          inviteCodeHash: null,
          inviteExpiresAt: null,
        })
        .where(
          and(
            eq(people.id, person.id),
            sql`${people.linkedUserId} IS NULL`
          )
        )
        .returning();

      if (!claimedPerson) {
        throw {
          status: 409,
          code: 'INVITE_USED',
          message: 'This invite was already claimed.',
        };
      }

      await recordAuditLog(
        {
          actor: req.user,
          action: 'invite.claim',
          entityType: 'Person',
          entityId: claimedPerson.id,
          groupId: claimedPerson.groupId,
          after: { linkedUserId: userId },
          ipAddress: req.ip,
        },
        tx
      );

      return {
        groupId: claimedPerson.groupId,
        personId: claimedPerson.id,
        groupName: group.name,
        linkedUserId: userId,
        inviteCodeHash: null,
      };
    });

    res.json({
      success: true,
      message: result.alreadyClaimed
        ? 'You have already claimed this profile.'
        : 'Profile successfully linked to your account! 🎉',
      data: result,
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.status || 400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.personId ? { personId: error.personId } : {}),
        },
      });
    }
    next(error);
  }
}

// Alias for backward compatibility
export const acceptInviteCode = claimInviteCode;

