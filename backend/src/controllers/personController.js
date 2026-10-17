import { eq, and, or, inArray, desc } from 'drizzle-orm';
import { db } from '../config/db.js';
import { people, groups, expenses, expenseSplits, payments, users } from '../models/index.js';
import { ensureGroupNotSettled } from '../services/groupService.js';
import { recordAuditLog } from '../services/auditService.js';
import { generateSecureToken, hashToken } from '../services/tokenService.js';
import { buildShareUrl } from '../utils/urlHelper.js';
import env from '../config/env.js';

export async function addPerson(req, res, next) {
  try {
    const { groupId } = req.params;
    const { name, phone, note } = req.body;

    await ensureGroupNotSettled(groupId);

    const [newPerson] = await db
      .insert(people)
      .values({
        groupId,
        name,
        phone: phone || '',
        note: note || '',
        isHost: false,
        shareEnabled: false,
      })
      .returning();

    await recordAuditLog({
      actor: req.user,
      action: 'ADD_PERSON',
      entityType: 'Person',
      entityId: newPerson.id,
      groupId,
      after: newPerson,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: newPerson,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPeople(req, res, next) {
  try {
    const { groupId } = req.params;

    const list = await db
      .select({
        id: people.id,
        groupId: people.groupId,
        name: people.name,
        phone: people.phone,
        note: people.note,
        isHost: people.isHost,
        linkedUserId: people.linkedUserId,
        shareEnabled: people.shareEnabled,
        inviteExpiresAt: people.inviteExpiresAt,
        canViewAllBills: people.canViewAllBills,
        lastViewedAt: people.lastViewedAt,
        createdAt: people.createdAt,
        updatedAt: people.updatedAt,
      })
      .from(people)
      .where(and(eq(people.groupId, groupId), eq(people.isDeleted, false)));

    const sanitized = list.map((p) => {
      const canSeePrivateDetails = req.isHost || p.id === req.viewerPerson?.id;
      return {
        ...p,
        phone: canSeePrivateDetails ? p.phone : '',
        note: canSeePrivateDetails ? p.note : '',
      };
    });

    res.json({
      success: true,
      data: sanitized,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePerson(req, res, next) {
  try {
    const { groupId, personId } = req.params;
    const { name, phone, note } = req.body;

    await ensureGroupNotSettled(groupId);

    const [existing] = await db
      .select()
      .from(people)
      .where(
        and(
          eq(people.id, personId),
          eq(people.groupId, groupId),
          eq(people.isDeleted, false)
        )
      );

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'PERSON_NOT_FOUND', message: 'Person not found in this group.' },
      });
    }

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (phone !== undefined) updateFields.phone = phone;
    if (note !== undefined) updateFields.note = note;

    const [updated] = await db
      .update(people)
      .set(updateFields)
      .where(eq(people.id, personId))
      .returning();

    await recordAuditLog({
      actor: req.user,
      action: 'UPDATE_PERSON',
      entityType: 'Person',
      entityId: personId,
      groupId,
      before: existing,
      after: updated,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function deletePerson(req, res, next) {
  try {
    const { groupId, personId } = req.params;

    const result = await db.transaction(async (tx) => {
      await ensureGroupNotSettled(groupId, tx);

      const [existing] = await tx
        .select()
        .from(people)
        .where(
          and(
            eq(people.id, personId),
            eq(people.groupId, groupId),
            eq(people.isDeleted, false)
          )
        );

      if (!existing) {
        return {
          status: 404,
          body: {
            success: false,
            error: { code: 'PERSON_NOT_FOUND', message: 'Person not found in this group.' },
          },
        };
      }

      if (existing.isHost) {
        return {
          status: 400,
          body: {
            success: false,
            error: {
              code: 'CANNOT_DELETE_HOST',
              message: 'The group host cannot be removed from the group.',
            },
          },
        };
      }

      // Check 1: Referenced as payer by any non-deleted expense
      const [paidExpense] = await tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(
          and(
            eq(expenses.groupId, groupId),
            eq(expenses.paidByPersonId, personId),
            eq(expenses.isDeleted, false)
          )
        )
        .limit(1);

      // Check 2: Referenced in a split of any non-deleted expense
      const [splitRef] = await tx
        .select({ id: expenseSplits.id })
        .from(expenseSplits)
        .innerJoin(
          expenses,
          and(
            eq(expenseSplits.expenseId, expenses.id),
            eq(expenses.groupId, groupId),
            eq(expenses.isDeleted, false)
          )
        )
        .where(
          and(
            eq(expenseSplits.personId, personId),
            eq(expenseSplits.groupId, groupId)
          )
        )
        .limit(1);

      // Check 3: Referenced by any non-deleted payment (any status, as sender or receiver)
      const [paymentRef] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.groupId, groupId),
            eq(payments.isDeleted, false),
            or(
              eq(payments.fromPersonId, personId),
              eq(payments.toPersonId, personId)
            )
          )
        )
        .limit(1);

      if (paidExpense || splitRef || paymentRef) {
        return {
          status: 409,
          body: {
            success: false,
            error: {
              code: 'PERSON_HAS_HISTORY',
              message:
                'Cannot remove this member because they have existing expenses or payments. Please delete or reassign their expenses and payments first.',
            },
          },
        };
      }

      const [deleted] = await tx
        .update(people)
        .set({ isDeleted: true })
        .where(eq(people.id, personId))
        .returning();

      await recordAuditLog(
        {
          actor: req.user,
          action: 'DELETE_PERSON',
          entityType: 'Person',
          entityId: personId,
          groupId,
          before: existing,
          after: deleted,
          ipAddress: req.ip,
        },
        tx
      );

      return {
        status: 200,
        body: {
          success: true,
          message: 'Person removed from group.',
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
}

/**
 * Host toggles can_view_all_bills for a single friend.
 * The host person row cannot have it set.
 */
export async function updatePersonPermissions(req, res, next) {
  try {
    const { groupId, personId } = req.params;
    const { canViewAllBills } = req.body;

    const [existing] = await db
      .select()
      .from(people)
      .where(and(eq(people.id, personId), eq(people.groupId, groupId), eq(people.isDeleted, false)));

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'PERSON_NOT_FOUND', message: 'Person not found in this group.' },
      });
    }

    if (existing.isHost) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_SET_HOST', message: 'The host person does not need a view permission.' },
      });
    }

    const [updated] = await db
      .update(people)
      .set({ canViewAllBills })
      .where(eq(people.id, personId))
      .returning();

    await recordAuditLog({
      actor: req.user,
      action: canViewAllBills ? 'GRANT_VIEW_ALL_BILLS' : 'REVOKE_VIEW_ALL_BILLS',
      entityType: 'Person',
      entityId: personId,
      groupId,
      before: { canViewAllBills: existing.canViewAllBills },
      after: { canViewAllBills },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * Host grants or revokes can_view_all_bills for ALL friends in the group at once.
 */
export async function bulkSetViewAllBills(req, res, next) {
  try {
    const { groupId } = req.params;
    const { enabled } = req.body;

    const updated = await db
      .update(people)
      .set({ canViewAllBills: enabled })
      .where(and(eq(people.groupId, groupId), eq(people.isHost, false), eq(people.isDeleted, false)))
      .returning({ id: people.id });

    await recordAuditLog({
      actor: req.user,
      action: enabled ? 'BULK_GRANT_VIEW_ALL_BILLS' : 'BULK_REVOKE_VIEW_ALL_BILLS',
      entityType: 'Group',
      entityId: groupId,
      groupId,
      after: { enabled, affectedCount: updated.length },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: { affectedCount: updated.length, enabled } });
  } catch (error) {
    next(error);
  }
}

/**
 * Level 1: Generate or regenerate a private read-only view link for a person (/s/:token).
 * Token is 32 random bytes; only the SHA-256 hash is stored in the database.
 */
export async function generateShareLink(req, res, next) {
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
        error: {
          code: 'CANNOT_SHARE_HOST',
          message: 'The host profile cannot have an individual share link.',
        },
      });
    }

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);

    await db
      .update(people)
      .set({
        shareTokenHash: tokenHash,
        shareEnabled: true,
      })
      .where(eq(people.id, personId));

    await recordAuditLog({
      actor: req.user,
      action: 'GENERATE_SHARE_LINK',
      entityType: 'Person',
      entityId: personId,
      groupId,
      after: { shareEnabled: true },
      ipAddress: req.ip,
    });

    const viewUrl = buildShareUrl(rawToken);

    res.json({
      success: true,
      data: {
        rawToken,
        viewUrl,
        message: 'Share link generated. Note: The raw link is only shown once.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Revoke a person's share link.
 */
export async function revokeShareLink(req, res, next) {
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

    await db
      .update(people)
      .set({
        shareEnabled: false,
        shareTokenHash: null,
      })
      .where(eq(people.id, personId));

    await recordAuditLog({
      actor: req.user,
      action: 'REVOKE_SHARE_LINK',
      entityType: 'Person',
      entityId: personId,
      groupId,
      after: { shareEnabled: false },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Share link revoked successfully.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get itemized statement for a person (for detailed WhatsApp text & passbook view).
 */
export async function getPersonStatement(req, res, next) {
  try {
    const { groupId, personId } = req.params;

    if (!req.isHost && req.viewerPerson?.id !== personId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only view your own statement.',
        },
      });
    }

    // Fetch person and group
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

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    const [hostUser] = group ? await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        upiId: users.upiId,
        showUpi: users.showUpi,
      })
      .from(users)
      .where(eq(users.id, group.createdBy)) : [null];

    // Fetch all splits belonging to this person
    const personSplits = await db
      .select({
        splitId: expenseSplits.id,
        amount: expenseSplits.amount,
        expenseId: expenses.id,
        title: expenses.title,
        date: expenses.date,
        totalAmount: expenses.totalAmount,
        splitType: expenses.splitType,
        description: expenses.description,
        paidByPersonId: expenses.paidByPersonId,
      })
      .from(expenseSplits)
      .innerJoin(
        expenses,
        and(
          eq(expenseSplits.expenseId, expenses.id),
          eq(expenses.groupId, groupId),
          eq(expenses.isDeleted, false)
        )
      )
      .where(eq(expenseSplits.personId, personId))
      .orderBy(desc(expenses.date));

    // Fetch payer names for these expenses
    const payerIds = [...new Set(personSplits.map((s) => s.paidByPersonId))];
    const payerMap = new Map();
    if (payerIds.length > 0) {
      const payers = await db
        .select({ id: people.id, name: people.name, isHost: people.isHost })
        .from(people)
        .where(inArray(people.id, payerIds));
      payers.forEach((p) => payerMap.set(p.id, p));
    }

    const itemizedExpenses = personSplits.map((s) => ({
      expenseId: s.expenseId,
      title: s.title,
      date: s.date,
      description: s.description,
      totalAmount: s.totalAmount,
      personShare: s.amount,
      splitType: s.splitType,
      paidBy: payerMap.get(s.paidByPersonId)?.name || 'Unknown',
      isPaidBySelf: s.paidByPersonId === personId,
    }));

    // Fetch expenses paid by this person
    const paidBySelfExpenses = await db
      .select({
        id: expenses.id,
        totalAmount: expenses.totalAmount,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.groupId, groupId),
          eq(expenses.paidByPersonId, personId),
          eq(expenses.isDeleted, false)
        )
      );

    const paidExpensesTotal = paidBySelfExpenses.reduce((sum, e) => sum + e.totalAmount, 0);

    // Fetch payments involving this person
    const personPayments = await db.query.payments.findMany({
      where: and(
        eq(payments.groupId, groupId),
        eq(payments.isDeleted, false),
        or(eq(payments.fromPersonId, personId), eq(payments.toPersonId, personId))
      ),
      orderBy: [desc(payments.date), desc(payments.createdAt)],
      with: {
        fromPerson: { columns: { id: true, name: true, isHost: true } },
        toPerson: { columns: { id: true, name: true, isHost: true } },
      },
    });

    // Calculate totals
    const shareSplitsTotal = itemizedExpenses.reduce((sum, e) => sum + e.personShare, 0);

    let acceptedSentTotal = 0;
    let acceptedReceivedTotal = 0;
    let pendingSentTotal = 0;

    for (const p of personPayments) {
      if (p.status === 'accepted') {
        if (p.fromPersonId === personId) acceptedSentTotal += p.amount;
        if (p.toPersonId === personId) acceptedReceivedTotal += p.amount;
      } else if (p.status === 'pending') {
        if (p.fromPersonId === personId) pendingSentTotal += p.amount;
      }
    }

    // net = paidExpenses - shareSplits + acceptedSent - acceptedReceived
    const net = paidExpensesTotal - shareSplitsTotal + acceptedSentTotal - acceptedReceivedTotal;
    const remainingToPay = Math.max(0, -net);
    const groupOwesYou = Math.max(0, net);

    res.json({
      success: true,
      data: {
        person: {
          id: person.id,
          name: person.name,
          phone: person.phone,
          note: person.note,
          isHost: person.isHost,
          shareEnabled: person.shareEnabled,
        },
        group: {
          id: group.id,
          name: group.name,
          date: group.date,
          status: group.status,
          hostName: hostUser?.name,
          hostUsername: hostUser?.username,
          ...(hostUser?.showUpi && hostUser?.upiId ? { hostUpi: hostUser.upiId } : {}),
        },
        ...(hostUser?.showUpi && hostUser?.upiId ? { hostUpi: hostUser.upiId } : {}),
        summary: {
          shareSplitsTotal,
          paidExpensesTotal,
          acceptedSentTotal,
          acceptedReceivedTotal,
          pendingSentTotal,
          net,
          remainingToPay,
          groupOwesYou,
        },
        expenses: itemizedExpenses,
        payments: personPayments,
      },
    });
  } catch (error) {
    next(error);
  }
}
