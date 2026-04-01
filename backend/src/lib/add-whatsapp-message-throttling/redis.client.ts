/**
 * WhatsApp Message Throttling - Redis Client Management
 */

let redisClient: any = null;

/**
 * Get Redis client instance
 */
function getRedisClient() {
  if (!redisClient) {
    // Try to get shared Redis from message queue system
    try {
      const { redisConnectionOptions } = require('../message-queue-priority-system');
      const { createClient } = require('redis');
      redisClient = createClient(redisConnectionOptions);
      // Don't connect here - assume already connected by message queue system
    } catch (e) {
      throw new Error('Redis client not available. Please set redisClient via setRedisClient()');
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

export { getRedisClient };
