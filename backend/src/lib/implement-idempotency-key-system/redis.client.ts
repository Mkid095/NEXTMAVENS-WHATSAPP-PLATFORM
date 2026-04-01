/**
 * Redis Client Management for Idempotency
 */

let redisClient: any = null;

/**
 * Get or create the Redis client singleton
 */
export function getRedisClient() {
  if (!redisClient) {
    // Try to get shared Redis from message queue system
    try {
      const { redisConnectionOptions } = require('../message-queue-priority-system');
      const Redis = require('ioredis');
      redisClient = new Redis(redisConnectionOptions);
    } catch (e) {
      throw new Error('Redis client not available. Ensure message queue system is initialized or set Redis client via setRedisClient()');
    }
  }
  return redisClient;
}

/**
 * Set custom Redis client (for testing or separate connection)
 */
export function setRedisClient(client: any): void {
  redisClient = client;
}
