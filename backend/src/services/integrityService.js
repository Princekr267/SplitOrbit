import { sql, eq, and, desc } from 'drizzle-orm';
import { db } from '../config/db.js';
import { groups, people, expenses, expenseSplits, payments, integrityReports } from '../models/index.js';
import { calculateGroupBalances } from './balanceService.js';

/**
 * Runs a comprehensive database integrity check in a read-only transaction,
 * saves the report to integrity_reports, and returns the result.
 */
export async function runIntegrityCheck(runByUserId = null) {
  const startTime = Date.now();
  const issues = [];

  // Execute checks in read-only mode
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);

    // 1. Exactly one host person per non-deleted group
    const hostCountIssues = await tx.execute(sql`
      SELECT g.id as group_id, g.name as group_name, COUNT(p.id)::int as host_count
      FROM groups g
      LEFT JOIN people p ON p.group_id = g.id AND p.is_host = true AND p.is_deleted = false
      WHERE g.is_deleted = false
      GROUP BY g.id, g.name
      HAVING COUNT(p.id) <> 1;
    `);

    for (const row of hostCountIssues.rows || hostCountIssues) {
      issues.push({
        check: 'ONE_HOST_PER_GROUP',
        groupId: row.group_id,
        groupName: row.group_name,
        message: `Group "${row.group_name}" has ${row.host_count} hosts (must be exactly 1).`,
      });
    }

    // 2. No person claimed twice in the same group
    const duplicateClaimIssues = await tx.execute(sql`
      SELECT p.group_id, g.name as group_name, p.linked_user_id, COUNT(*)::int as claim_count
      FROM people p
      JOIN groups g ON g.id = p.group_id
      WHERE p.linked_user_id IS NOT NULL AND p.is_deleted = false AND g.is_deleted = false
      GROUP BY p.group_id, g.name, p.linked_user_id
      HAVING COUNT(*) > 1;
    `);

    for (const row of duplicateClaimIssues.rows || duplicateClaimIssues) {
      issues.push({
        check: 'DUPLICATE_USER_CLAIM',
        groupId: row.group_id,
        groupName: row.group_name,
        message: `User ${row.linked_user_id} is claimed ${row.claim_count} times in group "${row.group_name}".`,
      });
    }

    // 3. No payment where sender == receiver
    const selfPaymentIssues = await tx.execute(sql`
      SELECT p.id, p.group_id, g.name as group_name
      FROM payments p
      JOIN groups g ON g.id = p.group_id
      WHERE p.from_person_id = p.to_person_id;
    `);

    for (const row of selfPaymentIssues.rows || selfPaymentIssues) {
      issues.push({
        check: 'SELF_PAYMENT',
        groupId: row.group_id,
        paymentId: row.id,
        groupName: row.group_name,
        message: `Payment ${row.id} has identical sender and receiver.`,
      });
    }

    // 4. Split rows sum to each expense total (for non-deleted expenses)
    const splitSumIssues = await tx.execute(sql`
      SELECT e.id as expense_id, e.group_id, g.name as group_name, e.title, e.total_amount, COALESCE(SUM(es.amount), 0)::int as splits_sum
      FROM expenses e
      JOIN groups g ON g.id = e.group_id
      LEFT JOIN expense_splits es ON es.expense_id = e.id
      WHERE e.is_deleted = false
      GROUP BY e.id, e.group_id, g.name, e.title, e.total_amount
      HAVING COALESCE(SUM(es.amount), 0) <> e.total_amount;
    `);

    for (const row of splitSumIssues.rows || splitSumIssues) {
      issues.push({
        check: 'EXPENSE_SPLIT_SUM_MISMATCH',
        groupId: row.group_id,
        expenseId: row.expense_id,
        groupName: row.group_name,
        message: `Expense "${row.title}" total is ${row.total_amount} paise, but splits sum to ${row.splits_sum} paise.`,
      });
    }

    // 5. No cross-group references
    // 5a. Expense splits pointing across groups
    const crossSplitIssues = await tx.execute(sql`
      SELECT es.id, es.expense_id, es.group_id as split_group_id, e.group_id as expense_group_id, p.group_id as person_group_id
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      JOIN people p ON p.id = es.person_id
      WHERE es.group_id <> e.group_id OR p.group_id <> e.group_id;
    `);

    for (const row of crossSplitIssues.rows || crossSplitIssues) {
      issues.push({
        check: 'CROSS_GROUP_SPLIT_REFERENCE',
        expenseId: row.expense_id,
        message: `Expense split ${row.id} references entities across different groups.`,
      });
    }

    // 5b. Payments pointing across groups
    const crossPaymentIssues = await tx.execute(sql`
      SELECT pm.id, pm.group_id, fp.group_id as from_group_id, tp.group_id as to_group_id
      FROM payments pm
      JOIN people fp ON fp.id = pm.from_person_id
      JOIN people tp ON tp.id = pm.to_person_id
      WHERE fp.group_id <> pm.group_id OR tp.group_id <> pm.group_id;
    `);

    for (const row of crossPaymentIssues.rows || crossPaymentIssues) {
      issues.push({
        check: 'CROSS_GROUP_PAYMENT_REFERENCE',
        paymentId: row.id,
        groupId: row.group_id,
        message: `Payment ${row.id} references people belonging to different groups.`,
      });
    }

    // 6. Balanced pool check: sum of all net balances in each group must be exactly 0
    // 7. Settled groups check: all net balances in settled groups must be 0
    const activeAndSettledGroups = await tx
      .select({ id: groups.id, name: groups.name, status: groups.status })
      .from(groups)
      .where(eq(groups.isDeleted, false));

    for (const grp of activeAndSettledGroups) {
      try {
        const balances = await calculateGroupBalances(grp.id, tx);
        const netSum = (balances.people || []).reduce((acc, p) => acc + (p.net || 0), 0);

        if (netSum !== 0 || balances.summary?.netSumCheck !== 0) {
          issues.push({
            check: 'NET_SUM_NON_ZERO',
            groupId: grp.id,
            groupName: grp.name,
            message: `Group "${grp.name}" net balance sum is ${netSum} paise (must be 0).`,
          });
        }

        if (grp.status === 'settled') {
          const nonZeroNets = (balances.people || []).filter((p) => p.net !== 0);
          if (nonZeroNets.length > 0) {
            issues.push({
              check: 'SETTLED_GROUP_UNBALANCED',
              groupId: grp.id,
              groupName: grp.name,
              message: `Settled group "${grp.name}" has ${nonZeroNets.length} members with non-zero balances.`,
            });
          }
        }
      } catch (err) {
        issues.push({
          check: 'BALANCE_CALCULATION_ERROR',
          groupId: grp.id,
          groupName: grp.name,
          message: `Balance calculation error for "${grp.name}": ${err.message}`,
        });
      }
    }

    // 8. Deleted people who still have active non-deleted expenses, splits, or payments
    const deletedWithHistoryRows = await tx.execute(sql`
      SELECT 
        p.id as person_id, 
        p.name as person_name, 
        p.group_id, 
        g.name as group_name,
        (SELECT COUNT(*)::int FROM expenses e WHERE e.paid_by_person_id = p.id AND e.is_deleted = false) as paid_expense_count,
        (SELECT COUNT(*)::int FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE es.person_id = p.id AND e.is_deleted = false) as split_count,
        (SELECT COUNT(*)::int FROM payments pm WHERE (pm.from_person_id = p.id OR pm.to_person_id = p.id) AND pm.is_deleted = false) as payment_count
      FROM people p
      JOIN groups g ON g.id = p.group_id
      WHERE p.is_deleted = true
        AND (
          EXISTS (SELECT 1 FROM expenses e WHERE e.paid_by_person_id = p.id AND e.is_deleted = false)
          OR EXISTS (SELECT 1 FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE es.person_id = p.id AND e.is_deleted = false)
          OR EXISTS (SELECT 1 FROM payments pm WHERE (pm.from_person_id = p.id OR pm.to_person_id = p.id) AND pm.is_deleted = false)
        );
    `);

    for (const row of deletedWithHistoryRows.rows || deletedWithHistoryRows) {
      issues.push({
        check: 'DELETED_PERSON_HAS_HISTORY',
        groupId: row.group_id,
        groupName: row.group_name,
        personId: row.person_id,
        personName: row.person_name,
        message: `Deleted person "${row.person_name}" in group "${row.group_name}" still has active records (${row.paid_expense_count} paid expenses, ${row.split_count} splits, ${row.payment_count} payments).`,
      });
    }
  });

  const durationMs = Date.now() - startTime;
  const status = issues.length === 0 ? 'clean' : 'corrupted';

  const [report] = await db
    .insert(integrityReports)
    .values({
      status,
      issues,
      durationMs,
      runBy: runByUserId || null,
      checkedAt: new Date(),
    })
    .returning();

  return report;
}

/**
 * Returns the most recent integrity report, or null.
 */
export async function getLatestIntegrityReport() {
  const [report] = await db
    .select()
    .from(integrityReports)
    .orderBy(desc(integrityReports.checkedAt))
    .limit(1);

  return report || null;
}
