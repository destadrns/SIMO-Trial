import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const PREFIX = 'scrypt';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const normalizedPassword = String(password ?? '');
  const key = scryptSync(normalizedPassword, salt, KEY_LENGTH).toString('hex');
  return `${PREFIX}$${salt}$${key}`;
}

export function verifyPassword(password, passwordHash) {
  const [prefix, salt, key] = String(passwordHash ?? '').split('$');

  if (prefix !== PREFIX || !salt || !key) {
    return false;
  }

  const expected = Buffer.from(key, 'hex');
  const actual = Buffer.from(hashPassword(password, salt).split('$')[2], 'hex');

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
