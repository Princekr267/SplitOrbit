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
import { createGroupWithHost } from '../services/groupService.js';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

function makeAuthCookie(userId) {
  const token = jwt.sign({ sub: userId, userId, tv: 0 }, env.JWT_SECRET, { expiresIn: '7d' });
  return `splittrack_token=${token}`;
}

describe('ISSUE 1: Group Read Routes Access Control & Privacy Model', () => {
  let hostUser;
  let adminUser;
  let friendUserWithoutBills;
  let friendUserWithBills;
  let outsiderUser;

  let group;
  let hostPerson;
  let friendPersonWithoutBills;
  let friendPersonWithBills;
  let thirdPerson;

  let expense1; // paid by host, split among host & friendWithoutBills
  let expense2; // paid by host, split among host & friendWithBills
  let expense3; // paid by friendWithoutBills, split among host & friendWithoutBills
  let payment1; // host -> friendWithoutBills
  let payment2; // host -> friendWithBills

  beforeEach(async () => {
    const uid = Math.random().toString(36).substring(7);

    // 1. Create Users
    [hostUser] = await db
      .insert(users)
      .values({ name: 'Host User', username: `host_i1_${uid}`, email: `host_${uid}@test.com`, passwordHash: 'hash', role: 'user' })
      .returning();

    [adminUser] = await db
      .insert(users)
      .values({ name: 'Admin User', username: `admin_i1_${uid}`, email: `admin_${uid}@test.com`, passwordHash: 'hash', role: 'admin' })
      .returning();

    [friendUserWithoutBills] = await db
      .insert(users)
      .values({ name: 'Friend No Bills', username: `f1_i1_${uid}`, email: `f1_${uid}@test.com`, passwordHash: 'hash', role: 'user' })
      .returning();

    [friendUserWithBills] = await db
      .insert(users)
      .values({ name: 'Friend With Bills', username: `f2_i1_${uid}`, email: `f2_${uid}@test.com`, passwordHash: 'hash', role: 'user' })
      .returning();

    [outsiderUser] = await db
      .insert(users)
      .values({ name: 'Outsider User', username: `out_i1_${uid}`, email: `out_${uid}@test.com`, passwordHash: 'hash', role: 'user' })
      .returning();

    // 2. Create Group with Host
    const created = await createGroupWithHost({
      name: 'Privacy Group',
      user: hostUser,
      ipAddress: '127.0.0.1',
    });
    group = created.group;
    hostPerson = created.hostPerson;

    // 3. Create Linked Friends in Group
    [friendPersonWithoutBills] = await db
      .insert(people)
      .values({
        groupId: group.id,
        name: 'Friend Person 1',
        phone: '1112223333',
        note: 'Secret Note 1',
        isHost: false,
        linkedUserId: friendUserWithoutBills.id,
        canViewAllBills: false,
        shareTokenHash: 'hash_token_123',
        inviteCodeHash: 'hash_invite_123',
      })
      .returning();

    [friendPersonWithBills] = await db
      .insert(people)
      .values({
        groupId: group.id,
        name: 'Friend Person 2',
        phone: '4445556666',
        note: 'Secret Note 2',
        isHost: false,
        linkedUserId: friendUserWithBills.id,
        canViewAllBills: true,
        shareTokenHash: 'hash_token_456',
        inviteCodeHash: 'hash_invite_456',
      })
      .returning();

    [thirdPerson] = await db
      .insert(people)
      .values({
        groupId: group.id,
        name: 'Third Person',
        phone: '7778889999',
        note: 'Secret Note 3',
        isHost: false,
      })
      .returning();

    // 4. Create Expenses with Splits
    // Expense 1: Host paid 1000, split 500 host, 500 friendWithoutBills
    [expense1] = await db
      .insert(expenses)
      .values({
        groupId: group.id,
        title: 'Dinner for Host & Friend 1',
        totalAmount: 1000,
        paidByPersonId: hostPerson.id,
        splitType: 'equal',
        createdBy: hostUser.id,
      })
      .returning();

    await db.insert(expenseSplits).values([
      { expenseId: expense1.id, groupId: group.id, personId: hostPerson.id, amount: 500 },
      { expenseId: expense1.id, groupId: group.id, personId: friendPersonWithoutBills.id, amount: 500 },
    ]);

    // Expense 2: Host paid 2000, split 1000 host, 1000 friendWithBills (friendWithoutBills is NOT on this)
    [expense2] = await db
      .insert(expenses)
      .values({
        groupId: group.id,
        title: 'Lunch for Host & Friend 2',
        totalAmount: 2000,
        paidByPersonId: hostPerson.id,
        splitType: 'equal',
        createdBy: hostUser.id,
      })
      .returning();

    await db.insert(expenseSplits).values([
      { expenseId: expense2.id, groupId: group.id, personId: hostPerson.id, amount: 1000 },
      { expenseId: expense2.id, groupId: group.id, personId: friendPersonWithBills.id, amount: 1000 },
    ]);

    // Expense 3: FriendWithoutBills paid 600, split 300 host, 300 friendWithoutBills
    [expense3] = await db
      .insert(expenses)
      .values({
        groupId: group.id,
        title: 'Snacks by Friend 1',
        totalAmount: 600,
        paidByPersonId: friendPersonWithoutBills.id,
        splitType: 'equal',
        createdBy: hostUser.id,
      })
      .returning();

    await db.insert(expenseSplits).values([
      { expenseId: expense3.id, groupId: group.id, personId: hostPerson.id, amount: 300 },
      { expenseId: expense3.id, groupId: group.id, personId: friendPersonWithoutBills.id, amount: 300 },
    ]);

    // 5. Create Payments
    [payment1] = await db
      .insert(payments)
      .values({
        groupId: group.id,
        fromPersonId: friendPersonWithoutBills.id,
        toPersonId: hostPerson.id,
        amount: 200,
        mode: 'online',
        status: 'accepted',
        createdByType: 'host',
        createdBy: hostUser.id,
      })
      .returning();

    [payment2] = await db
      .insert(payments)
      .values({
        groupId: group.id,
        fromPersonId: friendPersonWithBills.id,
        toPersonId: hostPerson.id,
        amount: 500,
        mode: 'online',
        status: 'accepted',
        createdByType: 'host',
        createdBy: hostUser.id,
      })
      .returning();
  });

  it('1. Outsider gets 403 on all four routes, and 404 for non-existent group', async () => {
    const outsiderCookie = makeAuthCookie(outsiderUser.id);
    const fakeGroupId = '00000000-0000-0000-0000-000000000000';

    // 404 for non-existent group
    const res404Exp = await request(app)
      .get(`/api/groups/${fakeGroupId}/expenses`)
      .set('Cookie', [outsiderCookie]);
    expect(res404Exp.status).toBe(404);
    expect(res404Exp.body.error.code).toBe('GROUP_NOT_FOUND');

    const res404Pay = await request(app)
      .get(`/api/groups/${fakeGroupId}/payments`)
      .set('Cookie', [outsiderCookie]);
    expect(res404Pay.status).toBe(404);
    expect(res404Pay.body.error.code).toBe('GROUP_NOT_FOUND');

    const res404Ppl = await request(app)
      .get(`/api/groups/${fakeGroupId}/people`)
      .set('Cookie', [outsiderCookie]);
    expect(res404Ppl.status).toBe(404);
    expect(res404Ppl.body.error.code).toBe('GROUP_NOT_FOUND');

    const res404Stmt = await request(app)
      .get(`/api/groups/${fakeGroupId}/people/${hostPerson.id}/statement`)
      .set('Cookie', [outsiderCookie]);
    expect(res404Stmt.status).toBe(404);
    expect(res404Stmt.body.error.code).toBe('GROUP_NOT_FOUND');

    // 403 for existing group where user is outsider
    const resExp = await request(app)
      .get(`/api/groups/${group.id}/expenses`)
      .set('Cookie', [outsiderCookie]);
    expect(resExp.status).toBe(403);
    expect(resExp.body.error.code).toBe('FORBIDDEN');

    const resPay = await request(app)
      .get(`/api/groups/${group.id}/payments`)
      .set('Cookie', [outsiderCookie]);
    expect(resPay.status).toBe(403);
    expect(resPay.body.error.code).toBe('FORBIDDEN');

    const resPpl = await request(app)
      .get(`/api/groups/${group.id}/people`)
      .set('Cookie', [outsiderCookie]);
    expect(resPpl.status).toBe(403);
    expect(resPpl.body.error.code).toBe('FORBIDDEN');

    const resStmt = await request(app)
      .get(`/api/groups/${group.id}/people/${hostPerson.id}/statement`)
      .set('Cookie', [outsiderCookie]);
    expect(resStmt.status).toBe(403);
    expect(resStmt.body.error.code).toBe('FORBIDDEN');
  });

  it('2. Friend without canViewAllBills sees only own data and own split lines', async () => {
    const friendCookie = makeAuthCookie(friendUserWithoutBills.id);

    // Expenses: should see expense1 and expense3, but NOT expense2
    const resExp = await request(app)
      .get(`/api/groups/${group.id}/expenses`)
      .set('Cookie', [friendCookie]);

    expect(resExp.status).toBe(200);
    const returnedExpIds = resExp.body.data.map((e) => e.id);
    expect(returnedExpIds).toContain(expense1.id);
    expect(returnedExpIds).toContain(expense3.id);
    expect(returnedExpIds).not.toContain(expense2.id);

    // Splits: in expense1, only own split should be present (not host's split)
    const exp1 = resExp.body.data.find((e) => e.id === expense1.id);
    expect(exp1.splits).toHaveLength(1);
    expect(exp1.splits[0].personId).toBe(friendPersonWithoutBills.id);

    // Payments: should see payment1 (involving self), but NOT payment2
    const resPay = await request(app)
      .get(`/api/groups/${group.id}/payments`)
      .set('Cookie', [friendCookie]);

    expect(resPay.status).toBe(200);
    const returnedPayIds = resPay.body.data.map((p) => p.id);
    expect(returnedPayIds).toContain(payment1.id);
    expect(returnedPayIds).not.toContain(payment2.id);

    // Statement: can view own statement
    const resOwnStmt = await request(app)
      .get(`/api/groups/${group.id}/people/${friendPersonWithoutBills.id}/statement`)
      .set('Cookie', [friendCookie]);
    expect(resOwnStmt.status).toBe(200);
    expect(resOwnStmt.body.data.person.id).toBe(friendPersonWithoutBills.id);

    // Statement: cannot view other person's statement (403)
    const resOtherStmt = await request(app)
      .get(`/api/groups/${group.id}/people/${friendPersonWithBills.id}/statement`)
      .set('Cookie', [friendCookie]);
    expect(resOtherStmt.status).toBe(403);
    expect(resOtherStmt.body.error.code).toBe('FORBIDDEN');
  });

  it('3. Friend with canViewAllBills sees all expenses and payments, but no hash fields or foreign phones/notes', async () => {
    const friendBillsCookie = makeAuthCookie(friendUserWithBills.id);

    // Expenses: sees all 3 expenses
    const resExp = await request(app)
      .get(`/api/groups/${group.id}/expenses`)
      .set('Cookie', [friendBillsCookie]);

    expect(resExp.status).toBe(200);
    expect(resExp.body.data).toHaveLength(3);

    // Payments: sees both payments
    const resPay = await request(app)
      .get(`/api/groups/${group.id}/payments`)
      .set('Cookie', [friendBillsCookie]);

    expect(resPay.status).toBe(200);
    expect(resPay.body.data).toHaveLength(2);

    // People: returns list without sensitive hashes, and masks foreign phone/notes
    const resPpl = await request(app)
      .get(`/api/groups/${group.id}/people`)
      .set('Cookie', [friendBillsCookie]);

    expect(resPpl.status).toBe(200);
    const ppl = resPpl.body.data;
    expect(ppl).toHaveLength(4);

    const rawJson = JSON.stringify(resPpl.body);
    expect(rawJson).not.toContain('shareTokenHash');
    expect(rawJson).not.toContain('inviteCodeHash');
    expect(rawJson).not.toContain('hash_token_123');
    expect(rawJson).not.toContain('hash_invite_123');

    // Own person record has phone/note
    const self = ppl.find((p) => p.id === friendPersonWithBills.id);
    expect(self.phone).toBe('4445556666');
    expect(self.note).toBe('Secret Note 2');

    // Other person record has masked phone/note
    const other = ppl.find((p) => p.id === friendPersonWithoutBills.id);
    expect(other.phone).toBe('');
    expect(other.note).toBe('');
  });

  it('4. Host and Admin see everything, and never leak shareTokenHash or inviteCodeHash', async () => {
    const hostCookie = makeAuthCookie(hostUser.id);
    const adminCookie = makeAuthCookie(adminUser.id);

    for (const cookie of [hostCookie, adminCookie]) {
      // Expenses: all 3
      const resExp = await request(app)
        .get(`/api/groups/${group.id}/expenses`)
        .set('Cookie', [cookie]);
      expect(resExp.status).toBe(200);
      expect(resExp.body.data).toHaveLength(3);

      // Payments: all 2
      const resPay = await request(app)
        .get(`/api/groups/${group.id}/payments`)
        .set('Cookie', [cookie]);
      expect(resPay.status).toBe(200);
      expect(resPay.body.data).toHaveLength(2);

      // People: can see phone and notes for all members
      const resPpl = await request(app)
        .get(`/api/groups/${group.id}/people`)
        .set('Cookie', [cookie]);
      expect(resPpl.status).toBe(200);

      const rawJson = JSON.stringify(resPpl.body);
      expect(rawJson).not.toContain('shareTokenHash');
      expect(rawJson).not.toContain('inviteCodeHash');
      expect(rawJson).not.toContain('hash_token_123');

      const f1 = resPpl.body.data.find((p) => p.id === friendPersonWithoutBills.id);
      expect(f1.phone).toBe('1112223333');
      expect(f1.note).toBe('Secret Note 1');

      // Statement: can view any member's statement
      const resStmt = await request(app)
        .get(`/api/groups/${group.id}/people/${friendPersonWithoutBills.id}/statement`)
        .set('Cookie', [cookie]);
      expect(resStmt.status).toBe(200);
      expect(resStmt.body.data.person.id).toBe(friendPersonWithoutBills.id);
    }
  });
});
