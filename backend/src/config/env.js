import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  RECOVERY_PEPPER: z.string().min(32, 'RECOVERY_PEPPER must be at least 32 characters'),
}).refine(
  (data) => {
    if (data.NODE_ENV === 'production') {
      if (!data.FRONTEND_URL || data.FRONTEND_URL.includes('localhost') || data.FRONTEND_URL.includes('127.0.0.1')) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'FRONTEND_URL must be configured with a valid non-localhost URL in production',
    path: ['FRONTEND_URL'],
  }
);

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
export default env;
