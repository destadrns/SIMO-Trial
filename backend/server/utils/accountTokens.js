import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export function generateRawToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(rawToken) {
  return createHash('sha256').update(String(rawToken ?? '')).digest('hex');
}

export function verifyToken(rawToken, storedHash) {
  const actual = Buffer.from(hashToken(rawToken), 'hex');
  const expected = Buffer.from(String(storedHash ?? ''), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createAccountToken(prefix) {
  const token = `${prefix}_${generateRawToken()}`;
  return {
    id: `${prefix}-${randomUUID()}`,
    token,
    tokenHash: hashToken(token),
  };
}

export function hashAccountToken(token) {
  return hashToken(token);
}

export function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function isStrongEnoughPassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}
