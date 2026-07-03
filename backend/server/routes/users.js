import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { all, get, run, withTransaction } from '../db/database.js';
import { requireAuth, requireRoles } from '../utils/auth.js';
import { writeAuditLog } from '../utils/auditLogger.js';
import { createAccountToken, hoursFromNow } from '../utils/accountTokens.js';
import { asyncHandler, HttpError, requireRecord, sendData } from '../utils/http.js';
import { serializeUser } from '../utils/serializers.js';

const USER_SELECT = `
  SELECT u.*, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

export function createUsersRouter(db) {
  const router = Router();

  router.use(requireAuth);

  router.get('/', requireRoles('Admin', 'Owner', 'Super Admin'), asyncHandler(async (req, res) => {
    const rows = await all(db, `${USER_SELECT} ORDER BY u.name`);
    sendData(res, rows.map(serializeUser), { meta: { count: rows.length } });
  }));

  router.post('/invites', requireRoles('Super Admin'), asyncHandler(async (req, res) => {
    const { name, email, roleId, site = '' } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!String(name || '').trim() || !normalizedEmail || !String(roleId || '').trim()) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'name, email, dan roleId wajib diisi.');
    }

    const role = await get(db, 'SELECT id FROM roles WHERE id = ?', [roleId]);
    if (!role) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'roleId tidak valid.', { field: 'roleId' });
    }

    const existing = await get(db, 'SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      throw new HttpError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar.');
    }

    const userId = `usr-${randomUUID()}`;
    const invite = createAccountToken('invite');
    const expiresAt = hoursFromNow(72);

    await withTransaction(db, async () => {
      await run(
        db,
        `INSERT INTO users
          (id, name, email, password_hash, role_id, site, is_active, account_status,
           invited_by, invited_at, created_at)
         VALUES (?, ?, ?, '', ?, ?, 0, 'INVITED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, String(name).trim(), normalizedEmail, roleId, String(site || '').trim(), req.user.id],
      );
      await run(
        db,
        `INSERT INTO account_invites
          (id, user_id, token_hash, invited_by, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [invite.id, userId, invite.tokenHash, req.user.id, expiresAt],
      );
      await run(
        db,
        `INSERT INTO email_outbox (id, recipient_email, template, payload_json, created_at)
         VALUES (?, ?, 'account_invite', ?, CURRENT_TIMESTAMP)`,
        [`email-${randomUUID()}`, normalizedEmail, JSON.stringify({ userId, expiresAt })],
      );
      await writeAuditLog(db, {
        actor: { id: req.user.id, name: req.user.name, roleName: req.user.roleName },
        module: 'AccountLifecycle',
        actionType: 'INVITE_USER',
        action: 'Invite internal user',
        entityType: 'User',
        entityId: userId,
        tableName: 'users',
        previousValue: null,
        newValue: JSON.stringify({ email: normalizedEmail, roleId, accountStatus: 'INVITED' }),
        description: `Invited ${normalizedEmail}`,
      });
    });

    const row = await get(db, `${USER_SELECT} WHERE u.id = ?`, [userId]);
    sendData(res, {
      user: serializeUser(row),
      delivery: {
        mode: 'demo-response-only',
        inviteToken: invite.token,
        expiresAt,
      },
    }, { status: 201 });
  }));

  router.get('/:id', requireRoles('Admin', 'Owner', 'Super Admin'), asyncHandler(async (req, res) => {
    const row = requireRecord(
      await get(db, `${USER_SELECT} WHERE u.id = ?`, [req.params.id]),
      'User',
    );
    sendData(res, serializeUser(row));
  }));

  return router;
}
