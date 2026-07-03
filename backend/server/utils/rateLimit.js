import { HttpError } from './http.js';

const buckets = new Map();

function getClientKey(req, key) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
  return `${key}:${ip}`;
}

export function rateLimit({ key, windowMs, max }) {
  return (req, res, next) => {
    void res;

    const bucketKey = getClientKey(req, key);
    const now = Date.now();
    const bucket = buckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      throw new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan. Silakan coba lagi nanti.', {
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      });
    }

    next();
  };
}
