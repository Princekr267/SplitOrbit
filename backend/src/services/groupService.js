import { eq, and } from 'drizzle-orm';
import { db } from '../config/db.js';
import { groups, people } from '../models/index.js';
import { recordAuditLog } from './auditService.js';
import { calculateGroupBalances } from './balanceService.js';

export class GroupOperationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'GroupOperationError';
    this.status = status;
  }
}

/**
 * Creates a new group and automatically creates the Host Person record in the same atomic transaction.
 */
export async function createGroupWithHost({ name, date, description, user, ipAddress }) {
  return await db.transaction(async (tx) => {
    // 1. Create group
    const [group] = await tx
      .insert(groups)
      .values({
        name,
        date: date ? new Date(date) : new Date(),
        description: description || '',
        createdBy: user.id,
        status: 'active',
      })
      .returning();

    // 2. Create host person record in the same transaction
    const [hostPerson] = await tx
      .insert(people)
      .values({
        groupId: group.id,
        name: user.name,
        isHost: true,
        linkedUserId: user.id,
        shareEnabled: false,
      })
      .returning();

    // 3. Record audit log
    await recordAuditLog(
      {
        actor: user,
        action: 'CREATE_GROUP',
        entityType: 'Group',
        entityId: group.id,
        groupId: group.id,
        after: { ...group, hostPersonId: hostPerson.id },
        ipAddress,
      },
      tx
    );

    return { group, hostPerson };
  });
}

/**
 * Checks if a group is settled (locked). If settled, throws an error preventing modifications.
 */
export async function ensureGroupNotSettled(groupId, tx = db) {
  const [group] = await tx
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.isDeleted, false)));

  if (!group) {
    throw new GroupOperationError('Group not found', 404);
  }

  if (group.isFrozen) {
    const reasonText = group.frozenReason ? `: "${group.frozenReason}"` : '';
    throw new GroupOperationError(`This group is frozen by an admin${reasonText}`, 409);
  }

  if (group.status === 'settled') {
    throw new GroupOperationError(
      'This group is settled and locked. Please reopen the group to add or modify records.'
    );
  }

  return group;
}

/**
 * Settle group: Validates that all member balances are zero, then sets status to 'settled'.
 */
export async function settleGroup({ groupId, user, ipAddress }) {
  return await db.transaction(async (tx) => {
    const group = await ensureGroupNotSettled(groupId, tx);

    const balanceData = await calculateGroupBalances(groupId, tx);
    const nonZeroPeople = balanceData.people.filter((p) => p.net !== 0);

    if (nonZeroPeople.length > 0) {
      throw new GroupOperationError(
        'Cannot settle group while member balances are non-zero. All debts must be fully repaid first.'
      );
    }

    const [updatedGroup] = await tx
      .update(groups)
      .set({ status: 'settled' })
      .where(eq(groups.id, groupId))
      .returning();

    await recordAuditLog(
      {
        actor: user,
        action: 'SETTLE_GROUP',
        entityType: 'Group',
        entityId: groupId,
        groupId,
        before: { status: group.status },
        after: { status: 'settled' },
        ipAddress,
      },
      tx
    );

    return updatedGroup;
  });
}

/**
 * Reopen a settled group.
 */
export async function reopenGroup({ groupId, user, ipAddress }) {
  return await db.transaction(async (tx) => {
    const [group] = await tx
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.isDeleted, false)));

    if (!group) {
      throw new GroupOperationError('Group not found', 404);
    }

    if (group.status !== 'settled') {
      throw new GroupOperationError('Group is already active');
    }

    const [updatedGroup] = await tx
      .update(groups)
      .set({ status: 'active' })
      .where(eq(groups.id, groupId))
      .returning();

    await recordAuditLog(
      {
        actor: user,
        action: 'REOPEN_GROUP',
        entityType: 'Group',
        entityId: groupId,
        groupId,
        before: { status: 'settled' },
        after: { status: 'active' },
        ipAddress,
      },
      tx
    );

    return updatedGroup;
  });
}
