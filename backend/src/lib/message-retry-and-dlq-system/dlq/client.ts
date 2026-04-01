/**
 * DLQ Redis Client Singleton
 */

import Redis from 'ioredis';
import { redisConnectionOptions } from './config';

let redisClient: Redis | null = null;

/**
 * Get or create the Redis client singleton
 */
export async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    redisClient = new Redis(redisConnectionOptions);
  }
  return redisClient;
}

/**
 * Close the Redis client connection
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
