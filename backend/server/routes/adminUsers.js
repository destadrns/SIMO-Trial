import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { all, get, run, withTransaction } from '../db/database.js';
import { createAccountToken, hoursFromNow } from '../utils/accountTokens.js';
import { writeAuditLog } from '../utils/auditLogger.js';
import { requireAuth, requireRoles } from '../utils/auth.js';
import { getAppBaseUrl, sendInviteEmail, sendPasswordResetEmail } from '../utils/email.js';
import { asyncHandler, HttpError, requireRecord, sendData } from '../utils/http.js';
import { serializeUser } from '../utils/serializers.js';

const USER_SELECT = `
  SELECT u.*, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

function assertEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email tidak valid.', { field: 'email' });
  }
  return normalizedEmail;
}

async function assertRole(db, roleId) {
  const role = await get(db, 'SELECT id FROM roles WHERE id = ?', [roleId]);
  if (!role) throw new HttpError(400, 'VALIDATION_ERROR', 'roleId tidak valid.', { field: 'roleId' });
}

async function countActiveSuperAdmins(db, exceptUserId = null) {
  const row = await get(
    db,
    `SELECT COUNT(*) AS count
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'Super Admin'
        AND u.is_active = 1
        AND u.account_status = 'ACTIVE'
        AND (? IS NULL OR u.id <> ?)`,
    [exceptUserId, exceptUserId],
  );
  return Number(row.count);
}

function canPreviewTokens() {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_TOKEN_PREVIEW === 'true';
}

function safeDelivery(delivery) {
  if (!delivery) return delivery;
  const { delivered, mode, to, name, template, messageId } = delivery;
  return { delivered, mode, to, name, template, messageId };
}

async function createInvite(db, actor, payload, actionType = 'INVITE_USER') {
  const name = String(payload.name || '').trim();
  const email = assertEmail(payload.email);
  const roleId = String(payload.roleId || payload.role || '').trim();
  const site = String(payload.site || payload.division || '').trim();
  if (!name || !roleId) throw new HttpError(400, 'VALIDATION_ERROR', 'name, email, dan roleId wajib diisi.');

  await assertRole(db, roleId);
  if (await get(db, 'SELECT id FROM users WHERE email = ?', [email])) {
    throw new HttpError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar.');
  }

  const userId = `usr-${randomUUID()}`;
  const invite = createAccountToken('invite');
  const expiresAt = hoursFromNow(72);
  const inviteUrl = `${getAppBaseUrl()}/accept-invite?token=${encodeURIComponent(invite.token)}`;
  const delivery = await sendInviteEmail({ to: email, name, inviteUrl });

  await withTransaction(db, async () => {
    await run(
      db,
      `INSERT INTO users
        (id, name, email, password_hash, role_id, site, is_active, account_status,
         invited_by, invited_at, last_activity_at, created_at)
       VALUES (?, ?, ?, '', ?, ?, 0, 'INVITED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, name, email, roleId, site, actor.id],
    );
    await run(
      db,
      `INSERT INTO account_invites (id, user_id, token_hash, invited_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [invite.id, userId, invite.tokenHash, actor.id, expiresAt],
    );
    await run(
      db,
      `INSERT INTO email_outbox (id, recipient_email, template, payload_json, created_at)
       VALUES (?, ?, 'account_invite', ?, CURRENT_TIMESTAMP)`,
      [`email-${randomUUID()}`, email, JSON.stringify({ userId, expiresAt, deliveryMode: delivery.mode })],
    );
    await writeAuditLog(db, {
      actor,
      module: 'User Management',
      actionType,
      action: 'Invite internal user',
      entityType: 'User',
      entityId: userId,
      tableName: 'users',
      previousValue: null,
      newValue: JSON.stringify({ email, roleId, accountStatus: 'INVITED' }),
      description: `Invited ${email}`,
    });
  });

  const user = await get(db, `${USER_SELECT} WHERE u.id = ?`, [userId]);
  return {
    user: serializeUser(user),
    delivery: canPreviewTokens() && delivery.mode === 'development-response-only' ? { ...safeDelivery(delivery), inviteToken: invite.token, inviteUrl, expiresAt } : safeDelivery(delivery),
  };
}

export function createAdminUsersRouter(db) {
  const router = Router();
  router.use(requireAuth, requireRoles('Super Admin'));

  router.get('/', asyncHandler(async (req, res) => {
    const rows = await all(db, `${USER_SELECT} ORDER BY COALESCE(u.last_activity_at, u.password_changed_at, u.invited_at, u.activated_at, u.disabled_at, u.created_at) DESC, u.created_at DESC, u.name`);
    sendData(res, rows.map(serializeUser), { meta: { count: rows.length } });
  }));

  router.post('/invite', asyncHandler(async (req, res) => {
    const data = await createInvite(db, { id: req.user.id, name: req.user.name, roleName: req.user.roleName }, req.body);
    sendData(res, data, { status: 201 });
  }));

  router.post('/:id/resend-invite', asyncHandler(async (req, res) => {
    const user = requireRecord(await get(db, `${USER_SELECT} WHERE u.id = ?`, [req.params.id]), 'User');
    if (user.account_status !== 'INVITED') {
      throw new HttpError(400, 'INVALID_ACCOUNT_STATUS', 'Resend hanya untuk user INVITED.');
    }

    const invite = createAccountToken('invite');
    const expiresAt = hoursFromNow(72);
    const inviteUrl = `${getAppBaseUrl()}/accept-invite?token=${encodeURIComponent(invite.token)}`;
    const delivery = await sendInviteEmail({ to: user.email, name: user.name, inviteUrl });
    await withTransaction(db, async () => {
      await run(db, 'UPDATE account_invites SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL', [user.id]);
      await run(db, 'UPDATE users SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
      await run(db, `INSERT INTO account_invites (id, user_id, token_hash, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [invite.id, user.id, invite.tokenHash, req.user.id, expiresAt]);
      await writeAuditLog(db, {
        actor: { id: req.user.id, name: req.user.name, roleName: req.user.roleName },
        module: 'User Management',
        actionType: 'RESEND_INVITE',
        action: 'Resend account invite',
        entityType: 'User',
        entityId: user.id,
        tableName: 'account_invites',
        previousValue: null,
        newValue: JSON.stringify({ expiresAt }),
        description: `Resent invite to ${user.email}`,
      });
    });
    sendData(res, { delivery: canPreviewTokens() && delivery.mode === 'development-response-only' ? { ...safeDelivery(delivery), inviteToken: invite.token, inviteUrl, expiresAt } : safeDelivery(delivery) });
  }));

  router.post('/:id/reset-password', asyncHandler(async (req, res) => {
    const user = requireRecord(await get(db, `${USER_SELECT} WHERE u.id = ?`, [req.params.id]), 'User');
    if (user.account_status !== 'ACTIVE' || !user.is_active) {
      throw new HttpError(400, 'INVALID_ACCOUNT_STATUS', 'Reset password hanya untuk user ACTIVE. Gunakan resend invite untuk user INVITED.');
    }

    const reset = createAccountToken('reset');
    const expiresAt = hoursFromNow(0.5);
    const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(reset.token)}`;
    const delivery = await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

    await withTransaction(db, async () => {
      await run(db, `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [reset.id, user.id, reset.tokenHash, expiresAt]);
      await run(db, 'UPDATE users SET token_version = COALESCE(token_version, 0) + 1, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
      await run(db, `INSERT INTO email_outbox (id, recipient_email, template, payload_json, created_at) VALUES (?, ?, 'password_reset', ?, CURRENT_TIMESTAMP)`, [`email-${randomUUID()}`, user.email, JSON.stringify({ userId: user.id, expiresAt, deliveryMode: delivery.mode, requestedBy: req.user.id })]);
      await writeAuditLog(db, {
        actor: { id: req.user.id, name: req.user.name, roleName: req.user.roleName },
        module: 'User Management',
        actionType: 'ADMIN_RESET_PASSWORD',
        action: 'Send reset password email',
        entityType: 'User',
        entityId: user.id,
        tableName: 'password_reset_tokens',
        previousValue: null,
        newValue: JSON.stringify({ email: user.email, expiresAt, sessionsRevoked: true }),
        description: `Sent password reset to ${user.email}`,
      });
    });

    sendData(res, {
      message: 'Instruksi reset password sudah dikirim ke email user.',
      delivery: canPreviewTokens() && delivery.mode === 'development-response-only' ? { ...safeDelivery(delivery), resetUrl, expiresAt } : safeDelivery(delivery),
    });
  }));

  router.patch('/:id/role', asyncHandler(async (req, res) => {
    const nextRoleId = String(req.body?.roleId || req.body?.role || '').trim();
    await assertRole(db, nextRoleId);
    const user = requireRecord(await get(db, `${USER_SELECT} WHERE u.id = ?`, [req.params.id]), 'User');
    if (user.role_name === 'Super Admin' && nextRoleId !== 'super-admin' && await countActiveSuperAdmins(db, user.id) < 1) {
      throw new HttpError(400, 'LAST_SUPER_ADMIN', 'Tidak boleh downgrade Super Admin terakhir.');
    }
    await run(db, 'UPDATE users SET role_id = ?, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?', [nextRoleId, user.id]);
    await writeAuditLog(db, {
      actor: { id: req.user.id, name: req.user.name, roleName: req.user.roleName },
      module: 'User Management',
      actionType: 'CHANGE_USER_ROLE',
      action: 'Change user role',
      entityType: 'User',
      entityId: user.id,
      tableName: 'users',
      previousValue: user.role_id,
      newValue: nextRoleId,
      description: `Changed role for ${user.email}`,
    });
    sendData(res, serializeUser(await get(db, `${USER_SELECT} WHERE u.id = ?`, [user.id])));
  }));

  router.patch('/:id/status', asyncHandler(async (req, res) => {
    const nextStatus = String(req.body?.status || '').trim().toUpperCase();
    if (!['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(nextStatus)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'status harus ACTIVE, SUSPENDED, atau DISABLED.', { field: 'status' });
    }
    const user = requireRecord(await get(db, `${USER_SELECT} WHERE u.id = ?`, [req.params.id]), 'User');
    if (user.role_name === 'Super Admin' && nextStatus !== 'ACTIVE' && await countActiveSuperAdmins(db, user.id) < 1) {
      throw new HttpError(400, 'LAST_SUPER_ADMIN', 'Tidak boleh disable Super Admin terakhir.');
    }
    await run(db, 'UPDATE users SET account_status = ?, is_active = ?, disabled_at = CASE WHEN ? = ? THEN CURRENT_TIMESTAMP::text ELSE disabled_at END, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?', [nextStatus, nextStatus === 'ACTIVE' ? 1 : 0, nextStatus, 'DISABLED', user.id]);
    await writeAuditLog(db, {
      actor: { id: req.user.id, name: req.user.name, roleName: req.user.roleName },
      module: 'User Management',
      actionType: 'CHANGE_USER_STATUS',
      action: 'Change user status',
      entityType: 'User',
      entityId: user.id,
      tableName: 'users',
      previousValue: user.account_status,
      newValue: nextStatus,
      description: `Changed status for ${user.email}`,
    });
    sendData(res, serializeUser(await get(db, `${USER_SELECT} WHERE u.id = ?`, [user.id])));
  }));

  return router;
}
