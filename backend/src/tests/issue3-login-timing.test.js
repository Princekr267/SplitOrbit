import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../server.js';
import { db } from '../config/db.js';
import { users } from '../models/index.js';
import {
  BCRYPT_ROUNDS,
  DUMMY_PASSWORD_HASH,
  INVALID_CREDENTIALS_RESPONSE,
} from '../controllers/authController.js';

describe('Issue 3: Constant-time bcrypt compare and login enumeration protection', () => {
  const existingUsername = 'issue3_testuser';
  const existingPassword = 'CorrectPassword123!';

  beforeEach(async () => {
    // Create test user in DB for each test (setup.js truncates between tests)
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(existingPassword, salt);
    await db.insert(users).values({
      name: 'Issue3 User',
      username: existingUsername,
      passwordHash,
      role: 'user',
      isActive: true,
    });
  });

  it('1. DUMMY_PASSWORD_HASH is a valid bcrypt hash of length 60 with matching cost factor', () => {
    expect(typeof DUMMY_PASSWORD_HASH).toBe('string');
    expect(DUMMY_PASSWORD_HASH).toHaveLength(60);
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]?\$\d{2}\$/);
    expect(BCRYPT_ROUNDS).toBe(10);
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_ROUNDS);
  });

  it('2. Returns identical 401 response and error shape for non-existent user and wrong password', async () => {
    // 2a. Existing user with wrong password
    const resWrong = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.50.1.1')
      .send({
        username: existingUsername,
        password: 'WrongPassword456!',
      });

    // 2b. Non-existent user
    const resGhost = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.50.1.2')
      .send({
        username: 'non_existent_ghost_user_999',
        password: 'WrongPassword456!',
      });

    expect(resWrong.status).toBe(401);
    expect(resGhost.status).toBe(401);

    expect(resWrong.body).toEqual(INVALID_CREDENTIALS_RESPONSE);
    expect(resGhost.body).toEqual(INVALID_CREDENTIALS_RESPONSE);
    expect(resWrong.body).toEqual(resGhost.body);
  });

  it('3. Dummy compare is invoked with DUMMY_PASSWORD_HASH when user is not found', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare');

    await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.50.1.3')
      .send({
        username: 'unknown_user_spy_check',
        password: 'SamplePassword123!',
      });

    expect(compareSpy).toHaveBeenCalledWith('SamplePassword123!', DUMMY_PASSWORD_HASH);
    compareSpy.mockRestore();
  });
});
