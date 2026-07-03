import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { get } from '../db/database.js';
import { asyncHandler, HttpError, sendData } from '../utils/http.js';
import { getJwtSecret } from '../utils/auth.js';
import { verifyPassword } from '../utils/password.js';
import { serializeUser } from '../utils/serializers.js';

export function createAuthRouter(db) {
  const router = Router();

  router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Email dan password harus diisi.');
    }


    const user = await get(
      db,
      `SELECT u.*, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = ? AND u.is_active = 1`,
      [String(email).trim().toLowerCase()]
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email atau password salah.');
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.role_id,
        roleName: user.role_name,
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    sendData(res, {
      token,
      user: serializeUser(user),
    });
  }));

  return router;
}
