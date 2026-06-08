import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { env } from '@/config/env';
import { authRouter } from '@/modules/auth/auth.routes';
import { healthRouter } from '@/modules/health/health.routes';
import { submissionsRouter } from '@/modules/submissions/submissions.routes';
import { userPanelRouter } from '@/modules/user-panel/user-panel.routes';
import { stationsRouter } from '@/modules/stations/stations.routes';
import { limitsRouter } from '@/modules/limits/limits.routes';
import { approvalsRouter } from '@/modules/approvals/approvals.routes';
import { presenceRouter } from '@/modules/presence/presence.routes';
import { summariesRouter } from '@/modules/summaries/summaries.routes';
import { fuelRecordsRouter } from '@/modules/fuel-records/fuel-records.routes';
import { staffRouter } from '@/modules/staff/staff.routes';
import { usersRouter } from '@/modules/users/users.routes';
import { blockedCodesRouter } from '@/modules/blocked-codes/blocked-codes.routes';
import { auditLogsRouter } from '@/modules/audit-logs/audit-logs.routes';
import { reportsRouter } from '@/modules/reports/reports.routes';
import { reportsExportRouter } from '@/modules/reports/reports-export.routes';
import { chatRouter } from '@/modules/chat/chat.routes';
import { rusumlarRouter } from '@/modules/rusumlar/rusumlar.routes';
import { appSettingsRouter } from '@/modules/app-settings/app-settings.routes';
import { errorMiddleware, notFoundMiddleware } from '@/middleware/error.middleware';

export function createApp(): Application {
  const app = express();

  // Trust proxy (Render, Railway, Nginx — to'g'ri IP olish uchun)
  app.set('trust proxy', 1);

  // Security
  app.use(
    helmet({
      contentSecurityPolicy: false, // API uchun shart emas
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, mobile apps) yoki ruxsat berilgan
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
        } else if (env.corsOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error('CORS rad etildi'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  // Body parsers
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Compression
  app.use(compression());

  // Logging
  if (env.isDevelopment) {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  // ─── Routes ─────────────────────────────────────────
  app.use('/', healthRouter);
  app.use('/auth', authRouter);
  app.use('/user-panel', userPanelRouter);
  app.use('/submissions', submissionsRouter);
  app.use('/stations', stationsRouter);
  app.use('/limits', limitsRouter);
  app.use('/approvals', approvalsRouter);
  app.use('/presence', presenceRouter);
  app.use('/summaries', summariesRouter);
  app.use('/fuel-records', fuelRecordsRouter);
  app.use('/staff', staffRouter);
  app.use('/users', usersRouter);
  app.use('/blocked-codes', blockedCodesRouter);
  app.use('/audit-logs', auditLogsRouter);
  app.use('/reports/export', reportsExportRouter);
  app.use('/reports', reportsRouter);
  app.use('/chat', chatRouter);
  app.use('/rusumlar', rusumlarRouter);
  app.use('/app-settings', appSettingsRouter);

  // Root
  app.get('/', (_req, res) => {
    res.json({
      ok: true,
      service: env.APP_NAME,
      version: '0.1.0',
      docs: '/health',
    });
  });

  // 404
  app.use(notFoundMiddleware);

  // Error handler — eng oxirida
  app.use(errorMiddleware);

  return app;
}
