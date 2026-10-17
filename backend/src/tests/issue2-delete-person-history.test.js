import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { db } from '../config/db.js';
import {
  users,
  groups,
  people,
  expenses,
  expenseSplits,
  payments,
} from '../models/index.js';
import { eq } from 'drizzle-orm';
import { createGroupWithHost, settleGroup, GroupOperationError } from '../services/groupService.js';
import { runIntegrityCheck } from '../services/integrityService.js';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

function makeAuthCookie(userId) {
  const token = jwt.sign({ sub: userId, userId, tv: 0 }, env.JWT_SECRET, { expiresIn: '7d' });
  return `splittrack_token=${token}`;
}

describe('ISSUE 2: Delete Person Financial History Check & Integrity Guard', () => {
  let hostUser;
  let hostCookie;
  let group;
  let hostPerson;

  beforeEach(async () => {
    const uid = Math.random().toString(36).substring(7);

    [hostUser] = await db
      .insert(users)
      .values({
        name: 'Host User',
        username: `host_i2_${uid}`,
        email: `host_i2_${uid}@test.com`,
        passwordHash: 'hash',
        role: 'user',
      })
      .returning();

    hostCookie = makeAuthCookie(hostUser.id);

    const created = await createGroupWithHost({
      name: 'History Test Group',
      user: hostUser,
      ipAddress: '127.0.0.1',
    });
    group = created.group;
    hostPerson = created.hostPerson;
  });

  it('1. Blocks deleting the group host (400 CANNOT_DELETE_HOST)', async () => {
    const res = await request(app)
      .delete(`/api/groups/${group.id}/people/${hostPerson.id}`)
      .set('Cookie', [hostCookie]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_DELETE_HOST');
  });

  it('2. Successfully deletes a person with no financial history', async () => {
    const [cleanPerson] = await db
      .insert(people)
      .values({
        groupId: group.id,
        name: 'Clean Member',
        isHost: false,
      })
      .returning();

    const res = await request(app)
      .delete(`/api/groups/${group.id}/people/${cleanPerson.id}`)
      .set('Cookie', [hostCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const [inDb] = await db
      .select()
      .from(people)
      .where(eq(people.id, cleanPerson.id));
    expect(inDb.isDeleted).toBe(true);
  });

  it('3. Blocks deleting a person who paid an expense (409 PERSON_HAS_HISTORY)', async () => {
    const [payerPerson] = await db
      .insert(people)
      .values({ groupId: group.id, name: 'Payer Member', isHost: false })
      .returning();

    const [exp] = await db
      .insert(expenses)
      .values({
        groupId: group.id,
        title: 'Taxi Ride',
        totalAmount: 500,
        paidByPersonId: payerPerson.id,
        splitType: 'equal',
        createdBy: hostUser.id,
      })
      .returning();

    await db.insert(expenseSplits).values([
      { expenseId: exp.id, groupId: group.id, personId: hostPerson.id, amount: 500 },
    ]);

    const res = await request(app)
      .delete(`/api/groups/${group.id}/people/${payerPerson.id}`)
      .set('Cookie', [hostCookie]);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PERSON_HAS_HISTORY');
    expect(res.body.error.message).toContain('expenses or payments');
  });

  it('4. Blocks deleting a person who is included in an expense split (409 PERSON_HAS_HISTORY)', async () => {
    const [splitPerson] = await db
      .insert(people)
      .values({ groupId: group.id, name: 'Split Member', isHost: false })
      .returning();

    const [exp] = await db
      .insert(expenses)
      .values({
        groupId: group.id,
        title: 'Hotel Booking',
        totalAmount: 1000,
        paidByPersonId: hostPerson.id,
        splitType: 'equal',
        createdBy: hostUser.id,
      })
      .returning();

    await db.insert(expenseSplits).values([
      { expenseId: exp.id, groupId: group.id, personId: hostPerson.id, amount: 500 },
      { expenseId: exp.id, groupId: group.id, personId: splitPerson.id, amount: 500 },
    ]);

    const res = await request(app)
      .delete(`/api/groups/${group.id}/people/${splitPerson.id}`)
      .set('Cookie', [hostCookie]);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PERSON_HAS_HISTORY');
  });

  it('5. Blocks deleting a person who has a payment as sender or receiver (409 PERSON_HAS_HISTORY)', async () => {
    const [paymentPerson] = await db
      .insert(people)
      .values({ groupId: group.id, name: 'Payment Member', isHost: false })
      .returning();

    await db.insert(payments).values({
      groupId: group.id,
      fromPersonId: paymentPerson.id,
      toPersonId: hostPerson.id,
      amount: 300,
      mode: 'cash',
      status: 'pending',
      createdByType: 'friend',
      createdBy: hostUser.id,
    });

    const res = await request(app)
      .delete(`/api/groups/${group.id}/people/${paymentPerson.id}`)
      .set('Cookie', [hostCookie]);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PERSON_HAS_HISTORY');
  });

  it('6. Integrity check flags a group with a deleted person who has history', async () => {
    // Manually simulate existing corrupted production data: soft-deleted person with active expense
    const [corruptPerson] = await db
      .insert(people)
      .values({
        groupId: group.id,
        name: 'Ghost Member',
        isHost: false,
        isDeleted: true,
      })
      .returning();

    const [exp] = await db
      .insert(expenses)
      .values({
        groupId: group.id,
        title: 'Ghost Lunch',
        totalAmount: 400,
        paidByPersonId: corruptPerson.id,
        splitType: 'equal',
        createdBy: hostUser.id,
      })
      .returning();

    await db.insert(expenseSplits).values([
      { expenseId: exp.id, groupId: group.id, personId: hostPerson.id, amount: 400 },
    ]);

    const report = await runIntegrityCheck();
    expect(report.status).toBe('corrupted');

    const historyIssue = report.issues.find((i) => i.check === 'DELETED_PERSON_HAS_HISTORY');
    expect(historyIssue).toBeDefined();
    expect(historyIssue.personId).toBe(corruptPerson.id);
    expect(historyIssue.groupId).toBe(group.id);
  });

  it('7. settleGroup fails if group has a deleted person with history or net balance sum != 0', async () => {
    const [ghostPerson] = await db
      .insert(people)
      .values({
        groupId: group.id,
        name: 'Ghost Person',
        isHost: false,
        isDeleted: true,
      })
      .returning();

    // Give ghostPerson an expense
    const [exp] = await db
      .insert(expenses)
      .values({
        groupId: group.id,
        title: 'Old Dinner',
        totalAmount: 1000,
        paidByPersonId: ghostPerson.id,
        splitType: 'equal',
        createdBy: hostUser.id,
      })
      .returning();

    await db.insert(expenseSplits).values([
      { expenseId: exp.id, groupId: group.id, personId: hostPerson.id, amount: 1000 },
    ]);

    await expect(
      settleGroup({
        groupId: group.id,
        user: hostUser,
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow(GroupOperationError);
  });
});
