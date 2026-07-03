import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { get, run, withTransaction } from '../db/database.js';
import { createAccountToken, hashAccountToken, hoursFromNow, isStrongEnoughPassword } from '../utils/accountTokens.js';
import { writeAuditLog } from '../utils/auditLogger.js';
import { getJwtSecret } from '../utils/auth.js';
import { getAppBaseUrl, sendPasswordResetEmail } from '../utils/email.js';
import { asyncHandler, HttpError, sendData } from '../utils/http.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { rateLimit } from '../utils/rateLimit.js';
import { serializeUser } from '../utils/serializers.js';

function signUserToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, roleId: user.role_id, roleName: user.role_name },
    getJwtSecret(),
    { expiresIn: '24h' },
  );
}

function assertPassword(password, confirmPassword = password) {
  if (password !== confirmPassword || !isStrongEnoughPassword(password)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Password minimal 8 karakter dan wajib berisi huruf serta angka.');
  }
}

async function findValidInvite(db, token) {
  return get(
    db,
    `SELECT ai.*, u.name, u.email, u.account_status, r.name AS role_name
       FROM account_invites ai
       JOIN users u ON u.id = ai.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE ai.token_hash = ?
        AND ai.accepted_at IS NULL
        AND ai.revoked_at IS NULL
        AND ai.expires_at::timestamptz > CURRENT_TIMESTAMP
        AND u.account_status = 'INVITED'`,
    [hashAccountToken(token)],
  );
}

async function findValidReset(db, token) {
  return get(
    db,
    `SELECT prt.*, u.email, u.name
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ?
        AND prt.used_at IS NULL
        AND prt.expires_at::timestamptz > CURRENT_TIMESTAMP
        AND u.is_active = 1
        AND u.account_status = 'ACTIVE'`,
    [hashAccountToken(token)],
  );
}

export function createAuthRouter(db) {
  const router = Router();
  const loginLimiter = rateLimit({ key: 'auth-login', windowMs: 15 * 60 * 1000, max: 60 });
  const tokenLimiter = rateLimit({ key: 'auth-token', windowMs: 15 * 60 * 1000, max: 30 });

  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Email dan password harus diisi.');
    }

    const user = await get(
      db,
      `SELECT u.*, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = ? AND u.is_active = 1 AND u.account_status = 'ACTIVE'`,
      [normalizedEmail],
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      await writeAuditLog(db, {
        actor: { id: null, name: 'System', roleName: 'System' },
        module: 'Auth',
        actionType: 'LOGIN_FAILED',
        action: 'Login failed',
        entityType: 'User',
        entityId: normalizedEmail || 'unknown',
        tableName: 'users',
        previousValue: null,
        newValue: null,
        description: `Failed login for ${normalizedEmail || 'unknown email'}.`,
      });
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email atau password salah.');
    }

    await writeAuditLog(db, {
      actor: { id: user.id, name: user.name, roleName: user.role_name },
      module: 'Auth',
      actionType: 'LOGIN_SUCCESS',
      action: 'Login success',
      entityType: 'User',
      entityId: user.id,
      tableName: 'users',
      previousValue: null,
      newValue: null,
      description: 'User logged in.',
    });

    sendData(res, { token: signUserToken(user), user: serializeUser(user) });
  }));

  router.get('/invite/verify', tokenLimiter, asyncHandler(async (req, res) => {
    const invite = req.query.token ? await findValidInvite(db, req.query.token) : null;
    if (!invite) {
      throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Token undangan tidak valid atau kedaluwarsa.');
    }
    sendData(res, {
      name: invite.name,
      email: invite.email,
      roleName: invite.role_name,
      inviteStatus: 'VALID',
    });
  }));

  router.post(['/invite/accept', '/invites/accept'], tokenLimiter, asyncHandler(async (req, res) => {
    const { token, password, confirmPassword } = req.body || {};
    if (!token) throw new HttpError(400, 'VALIDATION_ERROR', 'Token wajib diisi.');
    assertPassword(password, confirmPassword ?? password);

    const invite = await findValidInvite(db, token);
    if (!invite) {
      throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Token undangan tidak valid atau kedaluwarsa.');
    }

    await withTransaction(db, async () => {
      await run(
        db,
        `UPDATE users
            SET password_hash = ?, is_active = 1, account_status = 'ACTIVE',
                activated_at = CURRENT_TIMESTAMP, password_changed_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [hashPassword(password), invite.user_id],
      );
      await run(db, 'UPDATE account_invites SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?', [invite.id]);
      await writeAuditLog(db, {
        actor: { id: invite.user_id, name: invite.email, roleName: 'Invited User' },
        module: 'User Management',
        actionType: 'ACCEPT_INVITE',
        action: 'Accept account invite',
        entityType: 'User',
        entityId: invite.user_id,
        tableName: 'users',
        previousValue: JSON.stringify({ accountStatus: 'INVITED' }),
        newValue: JSON.stringify({ accountStatus: 'ACTIVE' }),
        description: 'User activated invited account.',
      });
      await writeAuditLog(db, {
        actor: { id: invite.user_id, name: invite.email, roleName: 'Invited User' },
        module: 'User Management',
        actionType: 'ACTIVATE_USER',
        action: 'Activate user',
        entityType: 'User',
        entityId: invite.user_id,
        tableName: 'users',
        previousValue: JSON.stringify({ accountStatus: 'INVITED' }),
        newValue: JSON.stringify({ accountStatus: 'ACTIVE' }),
        description: 'Invited account became active.',
      });
    });

    const user = await get(db, `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [invite.user_id]);
    sendData(res, { user: serializeUser(user) });
  }));
  router.post('/password/forgot', tokenLimiter, asyncHandler(async (req, res) => {
    const normalizedEmail = String(req.body?.email || '').trim().toLowerCase();
    const reset = createAccountToken('reset');
    const expiresAt = hoursFromNow(0.5);
    const user = normalizedEmail
      ? await get(db, `SELECT id, email, name FROM users WHERE email = ? AND is_active = 1 AND account_status = 'ACTIVE'`, [normalizedEmail])
      : null;

    let delivery;
    if (user) {
      const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(reset.token)}`;
      delivery = await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
      await withTransaction(db, async () => {
        await run(db, `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [reset.id, user.id, reset.tokenHash, expiresAt]);
        await run(db, `INSERT INTO email_outbox (id, recipient_email, template, payload_json, created_at) VALUES (?, ?, 'password_reset', ?, CURRENT_TIMESTAMP)`, [`email-${randomUUID()}`, user.email, JSON.stringify({ userId: user.id, expiresAt, deliveryMode: delivery.mode })]);
        await writeAuditLog(db, {
          actor: { id: user.id, name: user.email, roleName: 'Account Owner' },
          module: 'Auth',
          actionType: 'FORGOT_PASSWORD_REQUESTED',
          action: 'Request password reset',
          entityType: 'User',
          entityId: user.id,
          tableName: 'password_reset_tokens',
          previousValue: null,
          newValue: JSON.stringify({ expiresAt }),
          description: 'Password reset requested.',
        });
      });
    }

    sendData(res, {
      message: 'Jika email terdaftar, instruksi reset password akan dikirim.',
      delivery: user && delivery?.mode === 'development-response-only' ? { ...delivery, resetToken: reset.token, resetUrl: `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(reset.token)}`, expiresAt } : undefined,
    });
  }));

  router.get('/password/reset/verify', tokenLimiter, asyncHandler(async (req, res) => {
    const reset = req.query.token ? await findValidReset(db, req.query.token) : null;
    if (!reset) {
      throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Token reset tidak valid atau kedaluwarsa.');
    }
    sendData(res, { email: reset.email, resetStatus: 'VALID' });
  }));

  router.post('/password/reset', tokenLimiter, asyncHandler(async (req, res) => {
    const { token, password, confirmPassword } = req.body || {};
    if (!token) throw new HttpError(400, 'VALIDATION_ERROR', 'Token wajib diisi.');
    assertPassword(password, confirmPassword ?? password);

    const reset = await findValidReset(db, token);
    if (!reset) {
      throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Token reset tidak valid atau kedaluwarsa.');
    }

    await withTransaction(db, async () => {
      await run(db, 'UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?', [hashPassword(password), reset.user_id]);
      await run(db, 'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [reset.id]);
      await writeAuditLog(db, {
        actor: { id: reset.user_id, name: reset.email, roleName: 'Account Owner' },
        module: 'Auth',
        actionType: 'RESET_PASSWORD_COMPLETED',
        action: 'Reset password',
        entityType: 'User',
        entityId: reset.user_id,
        tableName: 'users',
        previousValue: null,
        newValue: JSON.stringify({ passwordChanged: true }),
        description: 'User reset account password.',
      });
    });

    sendData(res, { message: 'Password berhasil direset.' });
  }));

  return router;
}
