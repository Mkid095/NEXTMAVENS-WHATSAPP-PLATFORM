import Redis from 'ioredis';

export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

export const redisConnectionOptions: any = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

export const DLQ_STREAM_PREFIX = process.env.DLQ_STREAM_PREFIX || 'dlq:whatsapp';
export const DLQ_RETENTION_DAYS = parseInt(process.env.DLQ_RETENTION_DAYS || '30', 10);
export const DLQ_RETENTION_MS = DLQ_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const DLQ_CONSUMER_GROUP = 'dlq-workers';

/**
 * Get the Redis stream key for a specific message type
 */
export function getDlqStreamKey(messageType: string): string {
  return `${DLQ_STREAM_PREFIX}:${messageType}`;
}
