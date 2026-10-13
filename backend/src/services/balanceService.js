import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '../config/db.js';
import { groups, people, expenses, expenseSplits, payments, users } from '../models/index.js';

/**
 * Computes group balances and per-person ledger stats.
 * All math is conducted strictly in integer paise.
 * 
 * Formula for each person P:
 * net = (total of expenses they paid) 
 *     - (total of their splits) 
 *     + (accepted payments they SENT) 
 *     - (accepted payments they RECEIVED)
 * 
 * Invariants:
 * sum(all nets in group) === 0
 * 
 * @param {string} groupId - Group UUID
 * @param {object} [tx=db] - Optional Drizzle transaction handle
 */
export async function calculateGroupBalances(groupId, tx = db) {
  // 1. Fetch all non-deleted members in the group with linked user info
  const groupPeople = await tx
    .select({
      id: people.id,
      name: people.name,
      isHost: people.isHost,
      linkedUserId: people.linkedUserId,
      accountName: users.name,
      username: users.username,
      avatarColor: users.avatarColor,
      shareEnabled: people.shareEnabled,
      hasShareLink: sql`CASE WHEN ${people.shareTokenHash} IS NOT NULL THEN true ELSE false END`.mapWith(Boolean),
      hasInvite: sql`CASE WHEN ${people.inviteCodeHash} IS NOT NULL THEN true ELSE false END`.mapWith(Boolean),
      inviteExpiresAt: people.inviteExpiresAt,
      canViewAllBills: people.canViewAllBills,
      isDeleted: people.isDeleted,
    })
    .from(people)
    .leftJoin(users, eq(people.linkedUserId, users.id))
    .where(and(eq(people.groupId, groupId), eq(people.isDeleted, false)));

  const personMap = new Map();
  for (const p of groupPeople) {
    personMap.set(p.id, {
      ...p,
      paidExpensesTotal: 0,
      shareSplitsTotal: 0,
      acceptedSentPaymentsTotal: 0,
      acceptedReceivedPaymentsTotal: 0,
      pendingSentPaymentsTotal: 0,
      pendingReceivedPaymentsTotal: 0,
      rejectedPaymentsTotal: 0,
      net: 0,
      remainingToPay: 0,
      groupOwesYou: 0,
    });
  }

  // 2, 3, 4: Aggregate expenses paid, splits, and payments concurrently
  const [paidExpensesAgg, splitsAgg, paymentsAgg] = await Promise.all([
    tx
      .select({
        personId: expenses.paidByPersonId,
        totalPaid: sql`COALESCE(SUM(${expenses.totalAmount}), 0)::text`.mapWith(Number),
      })
      .from(expenses)
      .where(and(eq(expenses.groupId, groupId), eq(expenses.isDeleted, false)))
      .groupBy(expenses.paidByPersonId),
    tx
      .select({
        personId: expenseSplits.personId,
        totalShare: sql`COALESCE(SUM(${expenseSplits.amount}), 0)::text`.mapWith(Number),
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
      .groupBy(expenseSplits.personId),
    tx
      .select({
        fromPersonId: payments.fromPersonId,
        toPersonId: payments.toPersonId,
        status: payments.status,
        total: sql`COALESCE(SUM(${payments.amount}), 0)::text`.mapWith(Number),
      })
      .from(payments)
      .where(and(eq(payments.groupId, groupId), eq(payments.isDeleted, false)))
      .groupBy(payments.fromPersonId, payments.toPersonId, payments.status),
  ]);

  for (const row of paidExpensesAgg) {
    if (personMap.has(row.personId)) {
      personMap.get(row.personId).paidExpensesTotal = row.totalPaid;
    }
  }

  for (const row of splitsAgg) {
    if (personMap.has(row.personId)) {
      personMap.get(row.personId).shareSplitsTotal = row.totalShare;
    }
  }

  for (const row of paymentsAgg) {
    const fromP = personMap.get(row.fromPersonId);
    const toP = personMap.get(row.toPersonId);

    if (row.status === 'accepted') {
      if (fromP) fromP.acceptedSentPaymentsTotal += row.total;
      if (toP) toP.acceptedReceivedPaymentsTotal += row.total;
    } else if (row.status === 'pending') {
      if (fromP) fromP.pendingSentPaymentsTotal += row.total;
      if (toP) toP.pendingReceivedPaymentsTotal += row.total;
    } else if (row.status === 'rejected') {
      if (fromP) fromP.rejectedPaymentsTotal += row.total;
    }
  }

  // 5. Compute net and UI metrics for each person
  let totalSpent = 0;
  let totalAcceptedPayments = 0;
  let totalPendingPayments = 0;
  let netSumCheck = 0;

  for (const person of personMap.values()) {
    // net = paidExpenses - shareSplits + acceptedSent - acceptedReceived
    const net =
      person.paidExpensesTotal -
      person.shareSplitsTotal +
      person.acceptedSentPaymentsTotal -
      person.acceptedReceivedPaymentsTotal;

    person.net = net;
    person.remainingToPay = Math.max(0, -net);
    person.groupOwesYou = Math.max(0, net);

    netSumCheck += net;
    totalSpent += person.paidExpensesTotal;
    totalAcceptedPayments += person.acceptedSentPaymentsTotal;
    totalPendingPayments += person.pendingSentPaymentsTotal;
  }

  // Total spent across group is total of all expenses (counted once)
  // Each expense is paid by one person, so sum of all paidExpensesTotal === totalSpent.
  const isSettledReady = [...personMap.values()].every((p) => p.net === 0);

  return {
    people: Array.from(personMap.values()),
    summary: {
      totalSpent,
      totalReceived: totalAcceptedPayments,
      totalPending: totalPendingPayments,
      isSettledReady,
      netSumCheck, // Must be 0
    },
  };
}

/**
 * Computes user-level summary stats across all groups they belong to or host.
 * Strictly from the user's own data only.
 * @param {string} userId
 * @param {object} [tx=db]
 */
export async function calculateUserStats(userId, tx = db) {
  // Query hosted groups, linked friend profiles, hosted host-profiles, and pending payments concurrently
  const [[hosted], linkedPeople, hostedPeople, [hostedPending]] = await Promise.all([
    tx
      .select({ count: sql`count(*)::int` })
      .from(groups)
      .where(and(eq(groups.createdBy, userId), eq(groups.isDeleted, false))),
    tx
      .select({
        id: people.id,
        groupId: people.groupId,
        isHost: people.isHost,
      })
      .from(people)
      .innerJoin(groups, eq(people.groupId, groups.id))
      .where(
        and(
          eq(people.linkedUserId, userId),
          eq(people.isHost, false),
          eq(people.isDeleted, false),
          eq(groups.isDeleted, false)
        )
      ),
    tx
      .select({
        id: people.id,
        groupId: people.groupId,
        isHost: people.isHost,
      })
      .from(people)
      .innerJoin(groups, eq(people.groupId, groups.id))
      .where(
        and(
          eq(groups.createdBy, userId),
          eq(people.isHost, true),
          eq(people.isDeleted, false),
          eq(groups.isDeleted, false)
        )
      ),
    tx
      .select({ count: sql`count(*)::int` })
      .from(payments)
      .innerJoin(groups, eq(payments.groupId, groups.id))
      .where(
        and(
          eq(groups.createdBy, userId),
          eq(payments.status, 'pending'),
          eq(payments.isDeleted, false),
          eq(groups.isDeleted, false)
        )
      ),
  ]);

  const allUserPeople = [...hostedPeople, ...linkedPeople];
  const uniqueGroupIds = [...new Set(allUserPeople.map((p) => p.groupId))];

  let totalOwedToMe = 0;
  let totalIOwe = 0;

  const groupBalancesList = await Promise.all(
    uniqueGroupIds.map((gid) => calculateGroupBalances(gid, tx))
  );

  for (let i = 0; i < uniqueGroupIds.length; i++) {
    const gid = uniqueGroupIds[i];
    const balances = groupBalancesList[i];
    const myPersonIds = new Set(allUserPeople.filter((p) => p.groupId === gid).map((p) => p.id));

    for (const p of balances.people) {
      if (myPersonIds.has(p.id)) {
        totalOwedToMe += p.groupOwesYou || 0;
        totalIOwe += p.remainingToPay || 0;
      }
    }
  }

  return {
    groupsHosted: hosted?.count || 0,
    linkedProfiles: linkedPeople.length,
    totalOwedToMe,
    totalIOwe,
    pendingApprovals: hostedPending?.count || 0,
  };
}

