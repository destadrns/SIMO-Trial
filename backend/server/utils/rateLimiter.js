import { HttpError } from './http.js';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const buckets = new Map();

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown')
    .split(',')[0]
    .trim();
}

function normalizePart(value) {
  return String(value || '').trim().toLowerCase().slice(0, 128) || 'anonymous';
}

export function createRateLimiter({ name, max = 10, windowMs = DEFAULT_WINDOW_MS, keyParts = [] }) {
  return (req, res, next) => {
    void res;
    const now = Date.now();
    const identity = [name, clientIp(req), ...keyParts.map((part) => normalizePart(part(req)))].join(':');
    const current = buckets.get(identity);

    if (!current || current.expiresAt <= now) {
      buckets.set(identity, { count: 1, expiresAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > max) {
      throw new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan. Silakan coba lagi beberapa saat lagi.', {
        retryAfterSeconds: Math.ceil((current.expiresAt - now) / 1000),
      });
    }

    next();
  };
}

export function resetRateLimitersForTests() {
  buckets.clear();
}
