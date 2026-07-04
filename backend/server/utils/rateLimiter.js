import { createClient } from 'redis';
import { HttpError } from './http.js';
import { logger } from './logger.js';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const buckets = new Map();
let redisClient;
let redisUnavailable = false;

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown')
    .split(',')[0]
    .trim();
}

function normalizePart(value) {
  return String(value || '').trim().toLowerCase().slice(0, 128) || 'anonymous';
}

async function getRedisClient() {
  if (!process.env.REDIS_URL || redisUnavailable) return null;
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (error) => logger.error('redis_rate_limit_error', { code: error?.code, message: error?.message }));
  }
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
    } catch (error) {
      redisUnavailable = true;
      logger.error('redis_rate_limit_unavailable', { code: error?.code, message: error?.message });
      return null;
    }
  }
  return redisClient;
}

function reject(currentExpiresAt, now) {
  throw new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan. Silakan coba lagi beberapa saat lagi.', {
    retryAfterSeconds: Math.ceil((currentExpiresAt - now) / 1000),
  });
}

async function checkRedis(identity, max, windowMs) {
  const client = await getRedisClient();
  if (!client) return false;
  const key = `rate-limit:${identity}`;
  const count = await client.incr(key);
  if (count === 1) await client.pExpire(key, windowMs);
  if (count > max) {
    const ttl = await client.pTTL(key);
    reject(Date.now() + Math.max(ttl, 0), Date.now());
  }
  return true;
}

function checkMemory(identity, max, windowMs) {
  const now = Date.now();
  const current = buckets.get(identity);
  if (!current || current.expiresAt <= now) {
    buckets.set(identity, { count: 1, expiresAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > max) reject(current.expiresAt, now);
}

export function createRateLimiter({ name, max = 10, windowMs = DEFAULT_WINDOW_MS, keyParts = [] }) {
  return async (req, res, next) => {
    void res;
    try {
      const identity = [name, clientIp(req), ...keyParts.map((part) => normalizePart(part(req)))].join(':');
      if (!(await checkRedis(identity, max, windowMs))) checkMemory(identity, max, windowMs);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function resetRateLimitersForTests() {
  buckets.clear();
  redisUnavailable = false;
}
