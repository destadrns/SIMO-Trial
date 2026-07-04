import cors from 'cors';
import express from 'express';
import { get } from './db/database.js';
import { createAuthRouter } from './routes/auth.js';
import { createAdminUsersRouter } from './routes/adminUsers.js';
import { createAuditLogsRouter } from './routes/auditLogs.js';
import { createLogisticsRouter } from './routes/logistics.js';
import { createProjectsRouter } from './routes/projects.js';
import { createQcChecklistsRouter } from './routes/qcChecklists.js';
import { createReportsRouter } from './routes/reports.js';
import { createRolesRouter } from './routes/roles.js';
import { createUsersRouter } from './routes/users.js';
import {
  createProjectWarehousesRouter,
  createWarehousesRouter,
} from './routes/warehouses.js';
import {
  createWarehouseWorkItemsRouter,
  createWorkItemsRouter,
} from './routes/workItems.js';
import { getJwtSecret } from './utils/auth.js';
import { asyncHandler, HttpError, sendData } from './utils/http.js';
import { logger } from './utils/logger.js';

export function createApp({ db }) {
  getJwtSecret();

  const app = express();
  app.locals.db = db;

  app.disable('x-powered-by');
  app.set('trust proxy', String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true');
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', asyncHandler(async (req, res) => {
    try {
      await get(db, 'SELECT 1 AS ok');
      sendData(res, {
        status: 'ok',
        server: 'running',
        environment: process.env.NODE_ENV || 'development',
        uptimeSeconds: Math.round(process.uptime()),
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        data: {
          status: 'degraded',
          server: 'running',
          environment: process.env.NODE_ENV || 'development',
          uptimeSeconds: Math.round(process.uptime()),
          database: 'disconnected',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }));

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/admin/users', createAdminUsersRouter(db));
  app.use('/api/roles', createRolesRouter(db));
  app.use('/api/users', createUsersRouter(db));
  app.use('/api/projects/:projectId/warehouses', createProjectWarehousesRouter(db));
  app.use('/api/projects', createProjectsRouter(db));
  app.use('/api/warehouses/:warehouseId/work-items', createWarehouseWorkItemsRouter(db));
  app.use('/api/warehouses', createWarehousesRouter(db));
  app.use('/api/work-items', createWorkItemsRouter(db));
  app.use('/api/qc-checklists', createQcChecklistsRouter(db));
  app.use('/api/reports', createReportsRouter(db));
  app.use('/api/logistics', createLogisticsRouter(db));
  app.use('/api/audit-logs', createAuditLogsRouter(db));

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found.`,
      },
    });
  });

  app.use((error, req, res, next) => {
    void req;
    void next;

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'Request body contains invalid JSON.',
        },
      });
    }

    if (error instanceof HttpError) {
      const payload = {
        code: error.code,
        message: error.message,
      };

      if (error.details) {
        payload.details = error.details;
      }

      return res.status(error.status).json({ error: payload });
    }

    if (error?.code?.startsWith('SQLITE_CONSTRAINT') || error?.code?.startsWith('23')) {
      return res.status(400).json({
        error: {
          code: 'DATABASE_CONSTRAINT',
          message: 'The request violates a database constraint.',
        },
      });
    }

    logger.error('unhandled_request_error', { code: error?.code, message: error?.message, path: req.originalUrl, method: req.method });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected server error occurred.',
      },
    });
  });

  return app;
}
