import { eq, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { authRateLimits } from '../models/authRateLimits.js';

/**
 * Checks and increments a rate limit counter stored in PostgreSQL.
 * @param {string} key Unique identifier for the rate limit bucket (e.g. "login:ip:127.0.0.1")
 * @param {number} maxLimit Max allowed attempts in the window
 * @param {number} windowMs Window duration in milliseconds
 * @returns {Promise<{ allowed: boolean, remaining: number, retryAfterSeconds: number }>}
 */
export async function checkAndConsumeRateLimit(key, maxLimit, windowMs) {
  const now = new Date();

  // Atomic single-statement upsert: row-level lock on primary key ensures atomic counter updates
  // without race conditions or lost updates under high concurrency.
  const [row] = await db
    .insert(authRateLimits)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        count: sql`CASE
          WHEN EXTRACT(EPOCH FROM (${now}::timestamptz - ${authRateLimits.windowStart})) * 1000 > ${windowMs} THEN 1
          ELSE ${authRateLimits.count} + 1
        END`,
        windowStart: sql`CASE
          WHEN EXTRACT(EPOCH FROM (${now}::timestamptz - ${authRateLimits.windowStart})) * 1000 > ${windowMs} THEN ${now}
          ELSE ${authRateLimits.windowStart}
        END`,
      },
    })
    .returning();

  const count = Number(row.count);
  const windowStart = new Date(row.windowStart);
  const windowAge = now.getTime() - windowStart.getTime();

  if (count > maxLimit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - windowAge) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxLimit - count),
    retryAfterSeconds: 0,
  };
}

/**
 * Checks if a key is currently rate-limited without consuming an attempt.
 */
export async function isRateLimited(key, maxLimit, windowMs) {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(authRateLimits)
    .where(eq(authRateLimits.key, key));

  if (!existing) return { isLimited: false, retryAfterSeconds: 0 };

  const windowAge = now.getTime() - new Date(existing.windowStart).getTime();
  if (windowAge > windowMs) {
    return { isLimited: false, retryAfterSeconds: 0 };
  }

  if (existing.count >= maxLimit) {
    const retryAfterSeconds = Math.ceil((windowMs - windowAge) / 1000);
    return { isLimited: true, retryAfterSeconds };
  }

  return { isLimited: false, retryAfterSeconds: 0 };
}

/**
 * Resets a rate limit counter (e.g. after successful login).
 */
export async function resetRateLimit(key) {
  await db.delete(authRateLimits).where(eq(authRateLimits.key, key));
}

/**
 * Records a failed attempt for failure-only rate limits (e.g. recovery-code or admin password).
 */
export async function recordFailedAttempt(key, maxLimit, windowMs) {
  return checkAndConsumeRateLimit(key, maxLimit, windowMs);
}
