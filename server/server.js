import 'dotenv/config';
import express      from 'express';
import cookieParser from 'cookie-parser';
import cors         from 'cors';

import { validateEnv }                  from './config/env.js';
validateEnv();

import { connectDB }                    from './config/db.js';
import { initializeSnapshotScheduler }  from './services/snapshotScheduler.js';
import {
  securityHeaders, mongoSanitizeMiddleware,
  sanitizeRequest, apiRateLimit,
  errorHandler, requestLogger,
} from './middleware/security.js';

import authRoutes          from './routes/auth.js';
import plaidRoutes         from './routes/plaid.js';
import investmentRoutes    from './routes/investments.js';
import realEstateRoutes    from './routes/realEstate.js';
import balanceHistoryRoutes from './routes/balanceHistory.js';
import advisorRoutes       from './routes/advisor.js';

import logger from './utils/logger.js';

const app  = express();

// Render (and most cloud platforms) sit behind a reverse proxy.
// Without this, Express sees 127.0.0.1 for every user and rate limiting
// cannot identify users correctly.
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3001', 10);

// ── Security middleware ───────────────────────────────────────────────────────
app.use(securityHeaders);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge:         86400,
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());
app.use(mongoSanitizeMiddleware);
app.use(sanitizeRequest);
app.use('/api', apiRateLimit);
app.use(requestLogger);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',            authRoutes);
app.use('/api/plaid',           plaidRoutes);
app.use('/api/investments',     investmentRoutes);
app.use('/api/real-estate',     realEstateRoutes);
app.use('/api/balance-history', balanceHistoryRoutes);
app.use('/api/advisor',         advisorRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
const startServer = async () => {
  await connectDB();
  initializeSnapshotScheduler();
  app.listen(PORT, '0.0.0.0', () => {
    logger.info('CapRate API started', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });
};

startServer().catch(err => {
  logger.error('Server failed to start', { error: err.message });
  process.exit(1);
});

export default app;
