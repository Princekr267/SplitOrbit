import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../server.js';
import { db } from '../config/db.js';
import { eq } from 'drizzle-orm';
import { users, authRateLimits } from '../models/index.js';
import { checkAndConsumeRateLimit } from '../services/rateLimitService.js';
import { getClientIp } from '../utils/ipHelper.js';

describe('Issue 4: Rate Limiting, Atomic Upsert & Vercel Client IP Resolution', () => {
  const testUsername = 'issue4_user';
  const testPassword = 'SecurePassword123!';

  beforeEach(async () => {
    // Clean and set up test user
    await db.delete(authRateLimits);
    await db.delete(users);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(testPassword, salt);
    await db.insert(users).values({
      name: 'Issue4 Test User',
      username: testUsername,
      passwordHash,
      role: 'user',
      isActive: true,
    });
  });

  describe('1. Atomic single-statement DB rate limit upsert concurrency', () => {
    it('accurately increments under concurrent race conditions without lost updates', async () => {
      const bucketKey = `test_race_${Date.now()}`;
      const maxLimit = 10;
      const windowMs = 60 * 1000;
      const concurrency = 20;

      // Fire 20 concurrent requests simultaneously
      const results = await Promise.all(
        Array.from({ length: concurrency }).map(() =>
          checkAndConsumeRateLimit(bucketKey, maxLimit, windowMs)
        )
      );

      const allowedCount = results.filter((r) => r.allowed).length;
      const blockedCount = results.filter((r) => !r.allowed).length;

      // Exactly maxLimit (10) allowed, remaining (10) blocked
      expect(allowedCount).toBe(maxLimit);
      expect(blockedCount).toBe(concurrency - maxLimit);

      // Verify DB row has count exactly equal to total consumed attempts (20)
      const [target] = await db
        .select()
        .from(authRateLimits)
        .where(eq(authRateLimits.key, bucketKey));
      expect(target).toBeDefined();
      expect(target.count).toBe(concurrency);
    });
  });

  describe('2. Dual login rate limiting: per-username vs per-IP', () => {
    it('per-username failed rate limit triggers across distributed IPs', async () => {
      // 5 failed attempts targeting the same username from 5 completely different IPs
      for (let i = 1; i <= 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', `192.0.2.${i}`)
          .send({ username: testUsername, password: 'WrongPassword!' });
        expect(res.status).toBe(401);
      }

      // 6th attempt from a 6th unique IP must be blocked by per-username failure limit
      const resBlocked = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.0.2.99')
        .send({ username: testUsername, password: 'WrongPassword!' });

      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.error.code).toBe('RATE_LIMITED');
      expect(resBlocked.headers['retry-after']).toBeDefined();
    });

    it('per-IP rate limit triggers across multiple different usernames', async () => {
      const singleIp = '198.51.100.77';

      // 30 login attempts from same IP using distinct usernames (1 each)
      for (let i = 1; i <= 30; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', singleIp)
          .send({ username: `user_spray_${i}`, password: 'WrongPassword!' });
        expect(res.status).toBe(401);
      }

      // 31st attempt from the same IP must be blocked by IP rate limit
      const resBlocked = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', singleIp)
        .send({ username: 'another_user', password: 'WrongPassword!' });

      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.error.code).toBe('RATE_LIMITED');
    });

    it('successful login resets the failed login attempt counter', async () => {
      // 3 failed logins
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', '10.99.1.1')
          .send({ username: testUsername, password: 'WrongPassword!' });
      }

      // 1 successful login resets counter
      const resSuccess = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.99.1.1')
        .send({ username: testUsername, password: testPassword });
      expect(resSuccess.status).toBe(200);

      // Now 4 more failed logins must be allowed (since counter was reset)
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', `10.99.1.${i + 10}`)
          .send({ username: testUsername, password: 'WrongPassword!' });
        expect(res.status).toBe(401);
      }
    });
  });

  describe('3. Vercel client IP resolution and header precedence', () => {
    it('prioritizes x-vercel-forwarded-for over spoofed x-forwarded-for', () => {
      const mockReq = {
        headers: {
          'x-vercel-forwarded-for': '203.0.113.195, 10.0.0.1',
          'x-forwarded-for': '1.2.3.4, 5.6.7.8',
          'x-real-ip': '9.9.9.9',
        },
        ip: '127.0.0.1',
      };

      const ip = getClientIp(mockReq);
      expect(ip).toBe('203.0.113.195');
    });

    it('prioritizes x-real-ip when x-vercel-forwarded-for is absent', () => {
      const mockReq = {
        headers: {
          'x-real-ip': '198.51.100.42',
          'x-forwarded-for': '1.1.1.1',
        },
      };

      const ip = getClientIp(mockReq);
      expect(ip).toBe('198.51.100.42');
    });

    it('strips IPv6 mapped IPv4 prefix', () => {
      const mockReq = {
        headers: {},
        ip: '::ffff:192.168.1.100',
      };

      const ip = getClientIp(mockReq);
      expect(ip).toBe('192.168.1.100');
    });
  });
});
