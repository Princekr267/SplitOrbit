import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { db } from '../config/db.js';
import { users } from '../models/index.js';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

import bcrypt from 'bcryptjs';

describe('adminController: System stats, User management & Audit trail inspection', () => {
  it('enforces requireAdmin guard: forbids regular users and unauthenticated requests', async () => {
    // 1. Unauthenticated request
    const unauthRes = await request(app).get('/api/admin/stats');
    expect(unauthRes.status).toBe(401);

    // 2. Regular user request
    const [regularUser] = await db
      .insert(users)
      .values({
        name: 'Normal User',
        username: 'regular_user',
        email: 'regular_user@splittrack.test',
        passwordHash: 'hash',
        role: 'user',
      })
      .returning();

    const userToken = jwt.sign({ userId: regularUser.id }, env.JWT_SECRET, { expiresIn: '1h' });

    const forbiddenRes = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', [`splittrack_token=${userToken}`]);

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');
  });

  it('allows admin to fetch system stats, list users, and toggle user active status', async () => {
    // 1. Create Admin
    const passwordHash = await bcrypt.hash('adminPassword123', 10);
    const [adminUser] = await db
      .insert(users)
      .values({
        name: 'System Superadmin',
        username: 'system_superadmin',
        email: 'superadmin@splittrack.test',
        passwordHash,
        role: 'admin',
      })
      .returning();

    const adminToken = jwt.sign({ userId: adminUser.id }, env.JWT_SECRET, { expiresIn: '1h' });

    // 2. Create Target User to toggle
    const [targetUser] = await db
      .insert(users)
      .values({
        name: 'Target Account',
        username: 'target_account',
        email: 'target_account@splittrack.test',
        passwordHash,
        isActive: true,
      })
      .returning();

    // 3. Admin fetches stats
    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', [`splittrack_token=${adminToken}`]);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.success).toBe(true);
    expect(statsRes.body.data.users.total).toBeGreaterThanOrEqual(2);
    expect(statsRes.body.data.expenses).toBeDefined();

    // 4. Admin lists users with search
    const usersRes = await request(app)
      .get('/api/admin/users?search=Target')
      .set('Cookie', [`splittrack_token=${adminToken}`]);

    expect(usersRes.status).toBe(200);
    expect(usersRes.body.data.users.length).toBeGreaterThanOrEqual(1);
    expect(usersRes.body.data.users[0].email).toBe('target_account@splittrack.test');

    // 5. Admin toggles user active status to false
    const toggleRes = await request(app)
      .patch(`/api/admin/users/${targetUser.id}/status`)
      .set('Cookie', [`splittrack_token=${adminToken}`])
      .send({
        isActive: false,
        reason: 'Account violation review',
        currentPassword: 'adminPassword123',
      });

    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.data.isActive).toBe(false);

    // Verify self-deactivation is forbidden
    const selfDeactRes = await request(app)
      .patch(`/api/admin/users/${adminUser.id}/status`)
      .set('Cookie', [`splittrack_token=${adminToken}`])
      .send({
        isActive: false,
        reason: 'Attempt self deactivation',
        currentPassword: 'adminPassword123',
      });

    expect(selfDeactRes.status).toBe(400);
    expect(selfDeactRes.body.error.code).toBe('CANNOT_SELF_DEACTIVATE');

    // 6. Admin queries audit logs
    const auditRes = await request(app)
      .get('/api/admin/audit-logs?action=admin.user.disable')
      .set('Cookie', [`splittrack_token=${adminToken}`]);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.logs.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.body.data.logs[0].entityId).toBe(targetUser.id);
  });

  it('handles account impersonation and exit-impersonation lifecycle for admin', async () => {
    const passwordHash = await bcrypt.hash('secretPass123', 10);

    // 1. Create an admin
    const [adminUser] = await db
      .insert(users)
      .values({
        name: 'Super Admin Person',
        username: 'super_impersonator',
        email: 'impersonator@splittrack.test',
        passwordHash,
        role: 'admin',
      })
      .returning();

    const adminToken = jwt.sign({ userId: adminUser.id, role: 'admin' }, env.JWT_SECRET, { expiresIn: '1h' });

    // 2. Create a host user to impersonate
    const [hostUser] = await db
      .insert(users)
      .values({
        name: 'Target Host User',
        username: 'target_host_acc',
        email: 'host_acc@splittrack.test',
        passwordHash,
        role: 'user',
      })
      .returning();

    // 3. Self-impersonation must be rejected
    const selfRes = await request(app)
      .post(`/api/admin/users/${adminUser.id}/impersonate`)
      .set('Cookie', [`splittrack_token=${adminToken}`])
      .send({ reason: 'Self impersonation test', currentPassword: 'secretPass123' });

    expect(selfRes.status).toBe(400);
    expect(selfRes.body.error.code).toBe('SELF_IMPERSONATION_DISALLOWED');

    // 4. Wrong admin password must be rejected
    const wrongPwRes = await request(app)
      .post(`/api/admin/users/${hostUser.id}/impersonate`)
      .set('Cookie', [`splittrack_token=${adminToken}`])
      .send({
        reason: 'Investigating billing error',
        currentPassword: 'incorrectPassword999',
      });

    expect(wrongPwRes.status).toBe(401);
    expect(wrongPwRes.body.error.code).toBe('INVALID_ADMIN_PASSWORD');

    // 5. Admin impersonates the target host user with correct password
    const impersonateRes = await request(app)
      .post(`/api/admin/users/${hostUser.id}/impersonate`)
      .set('Cookie', [`splittrack_token=${adminToken}`])
      .send({
        reason: 'Investigating hosted group billing error',
        currentPassword: 'secretPass123',
      });

    expect(impersonateRes.status).toBe(200);
    expect(impersonateRes.body.success).toBe(true);
    expect(impersonateRes.body.data.user.id).toBe(hostUser.id);
    expect(impersonateRes.body.data.user.isImpersonated).toBe(true);
    expect(impersonateRes.body.data.user.impersonatedBy).toBe(adminUser.id);

    const impersonationToken = impersonateRes.body.data.token;
    expect(impersonationToken).toBeDefined();

    // 5. Query /api/me with the impersonation token (as the target host user)
    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${impersonationToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.id).toBe(hostUser.id);
    expect(meRes.body.data.user.username).toBe('target_host_acc');
    expect(meRes.body.data.user.isImpersonated).toBe(true);
    expect(meRes.body.data.user.impersonator.id).toBe(adminUser.id);

    // 6. Exit impersonation mode
    const exitRes = await request(app)
      .post('/api/auth/exit-impersonation')
      .set('Authorization', `Bearer ${impersonationToken}`);

    expect(exitRes.status).toBe(200);
    expect(exitRes.body.success).toBe(true);
    expect(exitRes.body.data.user.id).toBe(adminUser.id);
    expect(exitRes.body.data.user.role).toBe('admin');
    expect(exitRes.body.data.user.isImpersonated).toBe(false);

    // 7. Verify restored admin token works on admin endpoints again
    const restoredAdminToken = exitRes.body.data.token;
    const adminCheckRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${restoredAdminToken}`);

    expect(adminCheckRes.status).toBe(200);
    expect(adminCheckRes.body.success).toBe(true);
  });
});
