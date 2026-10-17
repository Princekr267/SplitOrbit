import dns from 'node:dns';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import env from './env.js';
import * as schema from '../models/index.js';

// Prioritize IPv4 to avoid ENETUNREACH delays when IPv6 is unreachable on local networks/ISPs
dns.setDefaultResultOrder('ipv4first');

const { Pool } = pg;

const connectionString =
  env.NODE_ENV === 'test' && env.TEST_DATABASE_URL
    ? env.TEST_DATABASE_URL
    : env.DATABASE_URL;

const poolConfig = {
  connectionString,
  connectionTimeoutMillis: 10000, // 10s gives Neon serverless compute time to wake from idle sleep
  idleTimeoutMillis: 30000,
};

if (env.NODE_ENV === 'production') {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
}

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('❌ Unexpected idle PostgreSQL client error:', err);
});

export const db = drizzle(pool, { schema });

export default db;
