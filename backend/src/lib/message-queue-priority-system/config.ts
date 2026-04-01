/**
 * Message Queue Priority System - Configuration
 * Redis connection options and queue constants
 */

// Redis configuration
// Using ioredis-compatible options (host, port, password, etc.)
export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

export const redisConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,  // Required by BullMQ
  enableReadyCheck: false      // Optimize for cloud Redis
};

export const QUEUE_NAME = 'whatsapp-messages';
export const DEFAULT_CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '10', 10);

// Retry configuration (Phase 3 Step 1)
// Note: These are defaults; actual retry attempts per job type will be managed via job options
export const ENABLE_RETRY_DLQ = process.env.ENABLE_RETRY_DLQ === 'true';
export const DEFAULT_MAX_RETRIES = parseInt(process.env.MESSAGE_RETRY_MAX_ATTEMPTS || '5', 10);
export const DEFAULT_RETRY_DELAY = parseInt(process.env.MESSAGE_RETRY_BASE_DELAY_MS || '1000', 10);
export const MAX_RETRY_DELAY = parseInt(process.env.MESSAGE_RETRY_MAX_DELAY_MS || '300000', 10); // 5 minutes
