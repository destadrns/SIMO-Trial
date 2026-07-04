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
  void res;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Akses ditolak. Token autentikasi diperlukan.');
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', 'Token tidak valid atau kedaluwarsa.');
  }

  const db = req.app?.locals?.db;
  if (db) {
    const user = await get(
      db,
      `SELECT u.token_version, u.is_active, u.account_status, r.name AS role_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?`,
      [decoded.id],
    );

    if (!user || !user.is_active || user.account_status !== 'ACTIVE') {
      throw new HttpError(401, 'TOKEN_REVOKED', 'Sesi tidak aktif. Silakan login ulang.');
    }

    if (Number(decoded.tokenVersion || 0) !== Number(user.token_version || 0)) {
      throw new HttpError(401, 'TOKEN_REVOKED', 'Sesi sudah tidak berlaku. Silakan login ulang.');
    }
  }

  req.user = decoded;
  next();
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
