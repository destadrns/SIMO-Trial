import { Router } from 'express';
import { all, get } from '../db/database.js';
import { requireAuth, requireRoles } from '../utils/auth.js';
import { asyncHandler, requireRecord, sendData } from '../utils/http.js';
import { serializeUser } from '../utils/serializers.js';

const USER_SELECT = `
  SELECT u.*, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

export function createUsersRouter(db) {
  const router = Router();

  router.use(requireAuth, requireRoles('Admin', 'Owner'));

  router.get('/', asyncHandler(async (req, res) => {
    const rows = await all(db, `${USER_SELECT} ORDER BY u.name`);
    sendData(res, rows.map(serializeUser), { meta: { count: rows.length } });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const row = requireRecord(
      await get(db, `${USER_SELECT} WHERE u.id = ?`, [req.params.id]),
      'User',
    );
    sendData(res, serializeUser(row));
  }));

  return router;
}
