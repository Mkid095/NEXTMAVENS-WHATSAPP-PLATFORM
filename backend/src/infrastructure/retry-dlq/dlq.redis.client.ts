import Redis from 'ioredis';
import { redisConnectionOptions } from './dlq.config';

let redisClient: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    redisClient = new Redis(redisConnectionOptions);
  }
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
