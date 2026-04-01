/**
 * Rate Limiter Infrastructure
 *
 * Simple Redis-based sliding window rate limiter.
 */

import { createClient, RedisClientType } from 'redis';
import logger from '../shared/logger.js';

let redisClient: RedisClientType | null = null;
let rateLimiterInitialized = false;

export async function initializeRateLimiter(): Promise<void> {
  if (rateLimiterInitialized) return;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  redisClient = createClient({ url: redisUrl });

  redisClient.on('error', (err) => logger.error('[RateLimiter] Redis error:', err));

  await redisClient.connect();
  logger.info('[RateLimiter] Connected to Redis');

  rateLimiterInitialized = true;
}

export async function checkRateLimit(identifier: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetAfter: number }> {
  if (!redisClient) {
    throw new Error('Rate limiter not initialized');
  }

  const key = `rate-limit:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Remove old entries
    await redisClient.zRemRangeByScore(key, 0, windowStart);

    // Count current requests
    const count = await redisClient.zCard(key);

    // Check limit
    if (count >= limit) {
      const oldest = await redisClient.zRange(key, 0, 0);
      const resetAfter = oldest.length ? parseInt(oldest[0]) + windowMs - now : 0;
      return { allowed: false, remaining: 0, resetAfter };
    }

    // Add current request
    await redisClient.zAdd(key, { score: now, value: now.toString() });
    await redisClient.expire(key, Math.ceil(windowMs / 1000));

    const remaining = limit - (count + 1);
    return { allowed: true, remaining, resetAfter: windowMs };
  } catch (error) {
    logger.error('[RateLimiter] Check error:', error);
    // Fail open
    return { allowed: true, remaining: limit, resetAfter: windowMs };
  }
}

export function generateIdentifier(request: any): string {
  const ip = request.ip || request.connection.remoteAddress || 'unknown';
  const userId = request.user?.id || 'anonymous';
  return `${ip}:${userId}`;
}

export async function getRateLimiter() {
  return { checkRateLimit, generateIdentifier };
}
