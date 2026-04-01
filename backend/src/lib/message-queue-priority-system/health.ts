/**
 * Message Queue Priority System - Health Check
 * Redis connection health validation
 */

import { redisConnectionOptions } from './config';

let healthRedis: any = null;

/**
 * Validate Redis connection
 */
export async function validateRedisConnection(): Promise<boolean> {
  try {
    if (!healthRedis) {
      const Redis = require('ioredis');
      healthRedis = new Redis(redisConnectionOptions);
    }
    const pong = await healthRedis.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('Redis connection failed:', error);
    return false;
  }
}
