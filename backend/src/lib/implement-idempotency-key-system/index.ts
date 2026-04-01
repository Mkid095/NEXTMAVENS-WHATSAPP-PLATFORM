/**
 * Idempotency-Key System
 *
 * Prevents duplicate HTTP requests by caching responses keyed by Idempotency-Key.
 * Re-exports all components.
 */

// Types
export * from './types';

// Configuration
export { DEFAULT_IDEMPOTENCY_CONFIG } from './config';

// Redis client management
export { getRedisClient, setRedisClient } from './redis.client';

// Utilities
export {
  buildCacheKey,
  hashBody,
  serializeResponse,
  deserializeResponse
} from './utils';

// Manager class
export { IdempotencyManager } from './manager.class';

// Singleton management
export {
  initializeIdempotency,
  getIdempotencyManager,
  shutdownIdempotency
} from './singleton';

// Fastify integration
export { registerOnSendHook } from './fastify.hooks';
export { checkIdempotencyCache } from './middleware';
