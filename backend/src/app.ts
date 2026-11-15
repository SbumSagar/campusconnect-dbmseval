import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { ROOT_DIR, UPLOAD_ROOT, env } from './config/env.js';
import { checkDatabase } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import documentRoutes from './routes/documents.routes.js';
import { allocationsRouter, hostelsRouter, roomsRouter } from './routes/hostels.routes.js';
import { adminRouter, calendarRouter, integrityRouter, reportsRouter } from './routes/misc.routes.js';
import orderRoutes from './routes/orders.routes.js';
import outpassRoutes from './routes/outpasses.routes.js';
import { menuRouter, storesRouter } from './routes/stores.routes.js';
import studentRoutes from './routes/students.routes.js';

export function createApp() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const db = await checkDatabase();
    res.status(db.ok ? 200 : 503).json({ status: db.ok ? 'ok' : 'degraded', database: db.message, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/hostels', hostelsRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/allocations', allocationsRouter);
  app.use('/api/stores', storesRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/orders', orderRoutes);
  app.use('/api/outpasses', outpassRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/integrity', integrityRouter);
  app.use('/api', notFoundHandler);

  // Production: serve the built React app from the same origin.
  const web = path.join(ROOT_DIR, 'frontend', 'dist');
  if (env.NODE_ENV === 'production' && fs.existsSync(web)) {
    app.use(express.static(web, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
