import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../config/db.js';
import { expenses, expenseSplits, people } from '../models/index.js';
import { ensureGroupNotSettled } from '../services/groupService.js';
import { processSplits } from '../services/splitService.js';
import { recordAuditLog } from '../services/auditService.js';

export async function createExpense(req, res, next) {
  try {
    const { groupId } = req.params;
    const {
      title,
      totalAmount,
      date,
      paidByPersonId,
      description,
      splitType = 'equal',
      splits: rawSplits = [],
      selectedPersonIds = [],
    } = req.body;

    await ensureGroupNotSettled(groupId);

    let finalDesc = description || '';
    if (req.body.category && !finalDesc.includes('[cat:')) {
      finalDesc = `${finalDesc} [cat:${req.body.category}]`.trim();
    }
    if ((req.body.paymentStatus || req.body.status) && !finalDesc.includes('[status:')) {
      finalDesc = `${finalDesc} [status:${req.body.paymentStatus || req.body.status}]`.trim();
    }

    // Validate payer belongs to group and is not deleted
    const [payer] = await db
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(
        and(
          eq(people.id, paidByPersonId),
          eq(people.groupId, groupId),
          eq(people.isDeleted, false)
        )
      );

    if (!payer) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYER', message: 'Payer does not belong to this group or is removed.' },
      });
    }

    // Server-side compute splits
    const calculatedSplits = processSplits(
      splitType,
      totalAmount,
      rawSplits,
      selectedPersonIds
    );

    // Validate all split participants belong to group
    const participantIds = calculatedSplits.map((s) => s.personId);
    const validParticipants = await db
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          eq(people.groupId, groupId),
          eq(people.isDeleted, false),
          inArray(people.id, participantIds)
        )
      );

    if (validParticipants.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARTICIPANTS',
          message: 'One or more split participants do not belong to this group.',
        },
      });
    }

    // Execute in one transaction
    const result = await db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(expenses)
        .values({
          groupId,
          title,
          totalAmount,
          date: date ? new Date(date) : new Date(),
          paidByPersonId,
          description: finalDesc,
          splitType,
          createdBy: req.user.id,
        })
        .returning();

      const splitInserts = calculatedSplits.map((s) => ({
        expenseId: expense.id,
        groupId,
        personId: s.personId,
        amount: s.amount,
        basisPoints: s.basisPoints || null,
        exactAmount: s.exactAmount || null,
      }));

      const createdSplits = await tx
        .insert(expenseSplits)
        .values(splitInserts)
        .returning();

      await recordAuditLog(
        {
          actor: req.user,
          action: 'CREATE_EXPENSE',
          entityType: 'Expense',
          entityId: expense.id,
          groupId,
          after: { ...expense, splits: createdSplits },
          ipAddress: req.ip,
        },
        tx
      );

      return { ...expense, splits: createdSplits };
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getExpenses(req, res, next) {
  try {
    const { groupId } = req.params;

    const expenseList = await db.query.expenses.findMany({
      where: and(eq(expenses.groupId, groupId), eq(expenses.isDeleted, false)),
      orderBy: [desc(expenses.date), desc(expenses.createdAt)],
      with: {
        paidByPerson: {
          columns: { id: true, name: true, isHost: true },
        },
        splits: {
          with: {
            person: {
              columns: { id: true, name: true, isHost: true },
            },
          },
        },
      },
    });

    const enrich = (exp) => {
      let cat = null;
      let st = null;
      if (exp.description) {
        const catMatch = exp.description.match(/\[cat:([^\]]+)\]/);
        if (catMatch) cat = catMatch[1];
        const statusMatch = exp.description.match(/\[status:([^\]]+)\]/);
        if (statusMatch) st = statusMatch[1];
      }
      return {
        ...exp,
        category: exp.category || cat || 'others',
        paymentStatus: exp.paymentStatus || st || 'Pending',
        status: exp.status || st || 'Pending',
      };
    };

    if (req.isHost || req.viewerPerson?.canViewAllBills) {
      return res.json({
        success: true,
        data: expenseList.map(enrich),
      });
    }

    const myPersonId = req.viewerPerson?.id;
    const filteredList = [];

    for (const exp of expenseList) {
      const isPayer = exp.paidByPersonId === myPersonId;
      const mySplit = exp.splits.find((s) => s.personId === myPersonId);

      if (isPayer || mySplit) {
        filteredList.push({
          ...exp,
          splits: exp.splits.filter((s) => s.personId === myPersonId),
        });
      }
    }

    res.json({
      success: true,
      data: filteredList.map(enrich),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateExpense(req, res, next) {
  try {
    const { groupId, expenseId } = req.params;
    const {
      title,
      totalAmount,
      date,
      paidByPersonId,
      description,
      splitType,
      splits: rawSplits,
      selectedPersonIds,
    } = req.body;

    await ensureGroupNotSettled(groupId);

    const [existing] = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.groupId, groupId),
          eq(expenses.isDeleted, false)
        )
      );

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'EXPENSE_NOT_FOUND', message: 'Expense not found.' },
      });
    }

    const updatedTotal = totalAmount ?? existing.totalAmount;
    const updatedSplitType = splitType ?? existing.splitType;
    const updatedPayerId = paidByPersonId ?? existing.paidByPersonId;

    // Check payer
    const [payer] = await db
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          eq(people.id, updatedPayerId),
          eq(people.groupId, groupId),
          eq(people.isDeleted, false)
        )
      );

    if (!payer) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYER', message: 'Payer does not belong to this group.' },
      });
    }

    // Fetch existing splits if not provided
    let calculatedSplits = null;
    if (rawSplits || selectedPersonIds || totalAmount || splitType) {
      let splitsInput = rawSplits;
      let personIds = selectedPersonIds;

      if (!splitsInput && !personIds) {
        const currentSplits = await db
          .select()
          .from(expenseSplits)
          .where(eq(expenseSplits.expenseId, expenseId));
        splitsInput = currentSplits;
        personIds = currentSplits.map((s) => s.personId);
      }

      calculatedSplits = processSplits(
        updatedSplitType,
        updatedTotal,
        splitsInput || [],
        personIds || []
      );
    }

    const result = await db.transaction(async (tx) => {
      let updatedDesc = description ?? existing.description;
      if (req.body.category) {
        updatedDesc = updatedDesc.replace(/\[cat:[^\]]+\]/g, '').trim();
        updatedDesc = `${updatedDesc} [cat:${req.body.category}]`.trim();
      }
      if (req.body.paymentStatus || req.body.status) {
        const st = req.body.paymentStatus || req.body.status;
        updatedDesc = updatedDesc.replace(/\[status:[^\]]+\]/g, '').trim();
        updatedDesc = `${updatedDesc} [status:${st}]`.trim();
      }

      const updateFields = {
        title: title ?? existing.title,
        totalAmount: updatedTotal,
        date: date ? new Date(date) : existing.date,
        paidByPersonId: updatedPayerId,
        description: updatedDesc,
        splitType: updatedSplitType,
      };

      const [updatedExpense] = await tx
        .update(expenses)
        .set(updateFields)
        .where(eq(expenses.id, expenseId))
        .returning();

      let finalSplits = [];
      if (calculatedSplits) {
        await tx.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));

        finalSplits = await tx
          .insert(expenseSplits)
          .values(
            calculatedSplits.map((s) => ({
              expenseId,
              groupId,
              personId: s.personId,
              amount: s.amount,
              basisPoints: s.basisPoints || null,
              exactAmount: s.exactAmount || null,
            }))
          )
          .returning();
      }

      await recordAuditLog(
        {
          actor: req.user,
          action: 'UPDATE_EXPENSE',
          entityType: 'Expense',
          entityId: expenseId,
          groupId,
          before: existing,
          after: { ...updatedExpense, splits: finalSplits },
          ipAddress: req.ip,
        },
        tx
      );

      return { ...updatedExpense, splits: finalSplits };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteExpense(req, res, next) {
  try {
    const { groupId, expenseId } = req.params;

    await ensureGroupNotSettled(groupId);

    const [existing] = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.groupId, groupId),
          eq(expenses.isDeleted, false)
        )
      );

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'EXPENSE_NOT_FOUND', message: 'Expense not found.' },
      });
    }

    const [deleted] = await db
      .update(expenses)
      .set({ isDeleted: true })
      .where(eq(expenses.id, expenseId))
      .returning();

    await recordAuditLog({
      actor: req.user,
      action: 'DELETE_EXPENSE',
      entityType: 'Expense',
      entityId: expenseId,
      groupId,
      before: existing,
      after: deleted,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Expense deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
}
