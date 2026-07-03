import { Router } from 'express';
import { all } from '../db/database.js';
import { requireAuth, requireRoles } from '../utils/auth.js';
import { asyncHandler, sendData } from '../utils/http.js';
import { serializeAuditLog } from '../utils/serializers.js';

export function createAuditLogsRouter(db) {
  const router = Router();

  router.use(requireAuth, requireRoles('Admin', 'Owner', 'Production Manager'));

  router.get('/', asyncHandler(async (req, res) => {
    const conditions = [];
    const params = [];

    if (req.query.module) {
      conditions.push('module = ?');
      params.push(req.query.module);
    }

    if (req.query.userId) {
      conditions.push('user_id = ?');
      params.push(req.query.userId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await all(
      db,
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC`,
      params,
    );

    sendData(res, rows.map(serializeAuditLog), { meta: { count: rows.length } });
  }));

  return router;
}
