import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { get, run, withTransaction } from '../db/database.js';
import { createAccountToken, hashAccountToken, hoursFromNow, isStrongEnoughPassword } from '../utils/accountTokens.js';
import { writeAuditLog } from '../utils/auditLogger.js';
import { getJwtSecret, requireAuth } from '../utils/auth.js';
import { getAppBaseUrl, sendPasswordResetEmail } from '../utils/email.js';
import { asyncHandler, HttpError, sendData } from '../utils/http.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createRateLimiter } from '../utils/rateLimiter.js';
import { serializeUser } from '../utils/serializers.js';
import { clearSessionCookie, setSessionCookie } from '../utils/sessionCookie.js';

function signUserToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, roleId: user.role_id, roleName: user.role_name, tokenVersion: Number(user.token_version || 0) },
    getJwtSecret(),
    { expiresIn: '24h' },
  );
}

function assertPassword(password, confirmPassword = password) {
  if (password !== confirmPassword || !isStrongEnoughPassword(password)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Password minimal 8 karakter dan wajib berisi huruf serta angka.');
  }
}

function assertStrongPassword(password, confirmPassword = password) {
  if (password !== confirmPassword) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Konfirmasi password baru tidak sama.');
  }

  const value = String(password || '');
  if (value.length < 8 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Password baru minimal 8 karakter dan wajib berisi huruf besar, huruf kecil, angka, serta karakter khusus.');
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

const loginLimiter = createRateLimiter({
  name: 'auth-login',
  max: 8,
  windowMs: 15 * 60 * 1000,
  keyParts: [(req) => req.body?.email],
});

const forgotPasswordLimiter = createRateLimiter({
  name: 'auth-forgot-password',
  max: 5,
  windowMs: 15 * 60 * 1000,
  keyParts: [(req) => req.body?.email],
});

const tokenActionLimiter = createRateLimiter({
  name: 'auth-token-action',
  max: 10,
  windowMs: 15 * 60 * 1000,
  keyParts: [(req) => req.body?.token],
});

function canPreviewTokens() {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_TOKEN_PREVIEW === 'true';
}

function safeDelivery(delivery) {
  if (!delivery) return delivery;
  const { delivered, mode, to, name, template, messageId } = delivery;
  return { delivered, mode, to, name, template, messageId };
}

export function createAuthRouter(db) {
  const router = Router();

  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Email dan password harus diisi.');
    }

    const account = await get(
      db,
      `SELECT u.*, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = ?`,
      [normalizedEmail],
    );

    if (account && account.account_status !== 'ACTIVE') {
      await writeAuditLog(db, {
        actor: { id: null, name: 'System', roleName: 'System' },
        module: 'Auth',
        actionType: 'LOGIN_BLOCKED',
        action: 'Login blocked',
        entityType: 'User',
        entityId: account.id,
        tableName: 'users',
        previousValue: null,
        newValue: account.account_status,
        description: `Blocked login for ${normalizedEmail} with status ${account.account_status}.`,
      });
      const statusMessages = {
        INVITED: 'Akun belum aktif. Buka email undangan dan buat password terlebih dahulu.',
        SUSPENDED: 'Akun sedang disuspend. Hubungi Super Admin.',
        DISABLED: 'Akun dinonaktifkan. Hubungi Super Admin.',
      };
      throw new HttpError(401, 'ACCOUNT_INACTIVE', statusMessages[account.account_status] || 'Akun belum aktif. Hubungi Super Admin.');
    }

    const user = account?.is_active ? account : null;

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

    const token = signUserToken(user);
    setSessionCookie(res, token);
    sendData(res, { token, user: serializeUser(user) });
  }));

  router.post('/logout', (req, res) => {
    void req;
    clearSessionCookie(res);
    sendData(res, { message: 'Sesi berhasil diakhiri.' });
  });


  router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword || confirmPassword == null) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Password lama, password baru, dan konfirmasi password wajib diisi.');
    }

    assertStrongPassword(newPassword, confirmPassword);

    if (currentPassword === newPassword) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Password baru tidak boleh sama dengan password lama.');
    }

    const user = await get(
      db,
      `SELECT u.*, r.name AS role_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.id = ? AND u.is_active = 1 AND u.account_status = 'ACTIVE'`,
      [req.user.id],
    );

    if (!user) {
      throw new HttpError(401, 'TOKEN_REVOKED', 'Sesi tidak aktif. Silakan login ulang.');
    }

    if (user.role_name !== 'Super Admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Fitur ubah password tersedia untuk Super Admin.');
    }

    if (!verifyPassword(currentPassword, user.password_hash)) {
      throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Password lama tidak sesuai.');
    }

    await withTransaction(db, async () => {
      await run(
        db,
        'UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?',
        [hashPassword(newPassword), user.id],
      );
      await writeAuditLog(db, {
        actor: { id: user.id, name: user.name, roleName: user.role_name },
        module: 'Auth',
        actionType: 'CHANGE_PASSWORD',
        action: 'Change own password',
        entityType: 'User',
        entityId: user.id,
        tableName: 'users',
        previousValue: null,
        newValue: JSON.stringify({ passwordChanged: true, tokenVersionIncremented: true }),
        description: 'Super Admin changed own password.',
      });
    });

    clearSessionCookie(res);
    sendData(res, { message: 'Password berhasil diubah. Silakan login ulang dengan password baru.' });
  }));

  router.get('/invite/verify', asyncHandler(async (req, res) => {
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

  router.post(['/invite/accept', '/invites/accept'], tokenActionLimiter, asyncHandler(async (req, res) => {
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
                activated_at = CURRENT_TIMESTAMP, password_changed_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP
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
  router.post(['/password/forgot', '/forgot-password'], forgotPasswordLimiter, asyncHandler(async (req, res) => {
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
        await run(db, 'UPDATE users SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
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
      delivery: user && canPreviewTokens() && delivery?.mode === 'development-response-only' ? { ...safeDelivery(delivery), resetToken: reset.token, resetUrl: `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(reset.token)}`, expiresAt } : undefined,
    });
  }));

  router.get('/password/reset/verify', asyncHandler(async (req, res) => {
    const reset = req.query.token ? await findValidReset(db, req.query.token) : null;
    if (!reset) {
      throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Token reset tidak valid atau kedaluwarsa.');
    }
    sendData(res, { email: reset.email, resetStatus: 'VALID' });
  }));

  router.post(['/password/reset', '/reset-password'], tokenActionLimiter, asyncHandler(async (req, res) => {
    const { token, password, confirmPassword } = req.body || {};
    if (!token) throw new HttpError(400, 'VALIDATION_ERROR', 'Token wajib diisi.');
    assertPassword(password, confirmPassword ?? password);

    const reset = await findValidReset(db, token);
    if (!reset) {
      throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Token reset tidak valid atau kedaluwarsa.');
    }

    await withTransaction(db, async () => {
      await run(db, 'UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?', [hashPassword(password), reset.user_id]);
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
        newValue: JSON.stringify({ passwordChanged: true, tokenVersionIncremented: true }),
        description: 'User reset account password.',
      });
    });

    sendData(res, { message: 'Password berhasil direset.' });
  }));

  return router;
}
