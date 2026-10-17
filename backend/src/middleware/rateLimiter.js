import rateLimit from 'express-rate-limit';
import { getClientIp } from '../utils/ipHelper.js';

/**
 * In-memory rate limiters (generalLimiter and publicLinkLimiter):
 * Note on Serverless: These limiters operate in-memory and are best-effort per
 * serverless instance / node process to mitigate flood/DoS attacks without incurring
 * database round-trip overhead on high-frequency read routes.
 * Sensitive stateful auth endpoints (such as login, register, and password reset)
 * use PostgreSQL-backed atomic rate limiting via checkAndConsumeRateLimit.
 */

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again after 15 minutes.',
    },
  },
});

export const publicLinkLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 60, // Limit public link queries
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: {
      code: 'SHARE_RATE_LIMIT_EXCEEDED',
      message: 'Too many requests to this shared link. Please try again shortly.',
    },
  },
});
