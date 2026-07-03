import jwt from 'jsonwebtoken';
import { HttpError } from './http.js';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is required. Create backend/.env from backend/.env.example and set a strong secret.');
  }

  return secret;
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Akses ditolak. Token autentikasi diperlukan.');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    next();
  } catch {
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
