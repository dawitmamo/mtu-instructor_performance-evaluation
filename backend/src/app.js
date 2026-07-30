import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import { authRoutes } from './routes/authRoutes.js';
import { catalogRoutes } from './routes/catalogRoutes.js';
import { evaluationRoutes } from './routes/evaluationRoutes.js';
import { reportRoutes } from './routes/reportRoutes.js';
import { dashboardRoutes } from './routes/dashboardRoutes.js';
import { uploadRoutes } from './routes/uploadRoutes.js';
import { streamSelectionRoutes } from './routes/streamSelectionRoutes.js';
import { scheduleRoutes } from './routes/scheduleRoutes.js';
import { coursePreferenceRoutes } from './routes/coursePreferenceRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { databaseStatus } from './config/db.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use(morgan(env.nodeEnv === 'test' ? 'tiny' : 'combined'));
  app.get('/api/health', (req, res) => {
    const database = databaseStatus();
    res.status(database.connected ? 200 : 503).json({ status: database.connected ? 'ok' : 'degraded', service: 'uipes-api', database });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api', catalogRoutes, evaluationRoutes, reportRoutes, dashboardRoutes, uploadRoutes, streamSelectionRoutes, scheduleRoutes, coursePreferenceRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
