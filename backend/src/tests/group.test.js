import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../server.js';
import env from '../config/env.js';
import { db } from '../config/db.js';
import { users, groups, people } from '../models/index.js';
import {
  createGroupWithHost,
  settleGroup,
  reopenGroup,
  ensureGroupNotSettled,
  GroupOperationError,
} from '../services/groupService.js';

describe('groupService: Host person atomicity, constraints & settle lifecycle', () => {
  it('creates group and host person atomically in the same transaction', async () => {
    const [user] = await db
      .insert(users)
      .values({
        name: 'Kabir Host',
        username: 'kabir_host',
        email: 'kabir@splittrack.test',
        passwordHash: 'hash',
      })
      .returning();

    const { group, hostPerson } = await createGroupWithHost({
      name: 'Weekend Getaway',
      description: 'Lonavala trip',
      user,
      ipAddress: '127.0.0.1',
    });

    expect(group.id).toBeDefined();
    expect(group.name).toBe('Weekend Getaway');
    expect(group.status).toBe('active');

    expect(hostPerson.id).toBeDefined();
    expect(hostPerson.groupId).toBe(group.id);
    expect(hostPerson.name).toBe('Kabir Host');
    expect(hostPerson.isHost).toBe(true);
    expect(hostPerson.linkedUserId).toBe(user.id);
  });

  it('enforces partial unique index: exactly one isHost = true per group', async () => {
    const [user] = await db
      .insert(users)
      .values({
        name: 'Host User',
        username: 'host_dup',
        email: 'host_dup@splittrack.test',
        passwordHash: 'hash',
      })
      .returning();

    const { group } = await createGroupWithHost({
      name: 'Single Host Group',
      user,
    });

    // Attempting to insert a second isHost = true person in the same group must fail
    await expect(
      db.insert(people).values({
        groupId: group.id,
        name: 'Second Fake Host',
        isHost: true,
      })
    ).rejects.toThrow();
  });

  it('allows settling a group when all balances are zero and locks modifications', async () => {
    const [user] = await db
      .insert(users)
      .values({
        name: 'Host Settler',
        username: 'host_settler',
        email: 'settle@splittrack.test',
        passwordHash: 'hash',
      })
      .returning();

    const { group } = await createGroupWithHost({
      name: 'Clean Group',
      user,
    });

    // Since there are no expenses, all balances are 0 => settle succeeds
    const settled = await settleGroup({
      groupId: group.id,
      user,
      ipAddress: '127.0.0.1',
    });

    expect(settled.status).toBe('settled');

    // Attempting to check if group is not settled will now throw error
    await expect(ensureGroupNotSettled(group.id)).rejects.toThrow(
      'This group is settled and locked. Please reopen the group to add or modify records.'
    );

    // Reopen group succeeds
    const reopened = await reopenGroup({
      groupId: group.id,
      user,
      ipAddress: '127.0.0.1',
    });

    expect(reopened.status).toBe('active');
    await expect(ensureGroupNotSettled(group.id)).resolves.toBeDefined();
  });

  it('allows the host to edit group name and description via PATCH /api/groups/:groupId', async () => {
    const rand = Math.floor(Math.random() * 100000);
    const [host] = await db
      .insert(users)
      .values({
        name: 'Edit Host',
        username: `ed_${rand}`,
        email: `ed_${rand}@splitorbit.test`,
        passwordHash: 'hash',
      })
      .returning();

    const { group } = await createGroupWithHost({
      name: 'Original Trip Name',
      description: 'Original description',
      user: host,
    });

    const token = jwt.sign(
      { userId: host.id, username: host.username, role: host.role, tokenVersion: host.tokenVersion },
      env.JWT_SECRET
    );

    const res = await request(app)
      .patch(`/api/groups/${group.id}`)
      .set('Cookie', [`splitorbit_token=${token}`])
      .send({
        name: 'Updated Goa Trip 2026',
        description: 'New itinerary and notes',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Goa Trip 2026');
    expect(res.body.data.description).toBe('New itinerary and notes');
  });
});
