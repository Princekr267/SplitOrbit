import dns from 'node:dns';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

dns.setDefaultResultOrder('ipv4first');
import env from './config/env.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import personRoutes from './routes/personRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import shareRoutes from './routes/shareRoutes.js';
import inviteRoutes from './routes/inviteRoutes.js';
import friendRoutes from './routes/friendRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import meRoutes from './routes/meRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

export const app = express();

// Security middleware
app.use(helmet());

// CORS configuration with credentials allow-list
const allowedOrigins = [
  env.FRONTEND_URL,
  'https://split-orbit.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, health checks) or matching allowed origins exactly
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })
);

// Body and cookie parsing
app.use(express.json());
app.use(cookieParser());

// General rate limiting
app.use('/api', generalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/groups/:groupId/people', personRoutes);
app.use('/api/groups/:groupId/expenses', expenseRoutes);
app.use('/api/groups/:groupId/payments', paymentRoutes);
app.use('/api/s', shareRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/friend', friendRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);

// Centralized error handling
app.use(errorHandler);

// Listen when executed directly (skip on Vercel serverless runtime)
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const PORT = env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 SplitOrbit Backend running on http://localhost:${PORT}`);
  });
}

export default app;
