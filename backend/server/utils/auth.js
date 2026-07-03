import jwt from 'jsonwebtoken';
import { get } from '../db/database.js';
import { HttpError } from './http.js';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is required. Create backend/.env from backend/.env.example and set a strong secret.');
  }

  return secret;
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Akses ditolak. Token autentikasi diperlukan.');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());

    const db = req.app?.locals?.db;
    if (db) {
      const user = await get(
        db,
        `SELECT u.id, u.name, u.email, u.role_id, u.password_changed_at, r.name AS role_name
           FROM users u
           JOIN roles r ON r.id = u.role_id
          WHERE u.id = ?
            AND u.is_active = 1
            AND u.account_status = 'ACTIVE'`,
        [decoded.id],
      );

      if (!user) {
        throw new HttpError(401, 'INVALID_TOKEN', 'Token tidak valid atau akun sudah tidak aktif.');
      }

      if (user.password_changed_at && decoded.iat) {
        const passwordChangedAt = new Date(user.password_changed_at).getTime();
        const tokenIssuedAt = decoded.iat * 1000;
        if (Number.isFinite(passwordChangedAt) && passwordChangedAt > tokenIssuedAt) {
          throw new HttpError(401, 'TOKEN_REVOKED', 'Token sudah tidak berlaku. Silakan login ulang.');
        }
      }

      req.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.role_id,
        roleName: user.role_name,
      };
    } else {
      req.user = decoded;
    }

    next();
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(401, 'INVALID_TOKEN', 'Token tidak valid atau kedaluwarsa.');
  }
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    void res;

    if (!allowedRoles.includes(req.user?.roleName)) {
      throw new HttpError(403, 'FORBIDDEN', 'Akses tidak tersedia untuk role pengguna ini.');
    }

    next();
  };
}
