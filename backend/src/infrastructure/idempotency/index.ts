/**
 * Idempotency-Key System Middleware
 * Prevents duplicate HTTP requests from being processed by caching responses.
 *
 * Architecture:
 * - types.ts: Type definitions
 * - config.ts: Default configuration
 * - redis-client.ts: Redis client management
 * - utils.ts: Helper functions for keys and serialization
 * - storage.operations.ts: Cache get/store implementations (extracted)
 * - idempotency-manager.class.ts: Core manager class
 * - singleton.ts: Global instance management
 * - middleware.ts: Fastify integration
 *
 * All files under 150 lines.
 */

// Re-export types
export * from './types';

// Re-export configuration
export { DEFAULT_IDEMPOTENCY_CONFIG } from './config';

// Re-export utilities
export { buildCacheKey, hashBody, serializeResponse, deserializeResponse } from './utils';

// Re-export Redis client helpers
export { getRedisClient, setRedisClient } from './redis-client';

// Re-export main class
export { IdempotencyManager } from './idempotency-manager.class';

// Re-export storage operations (advanced usage)
export { getCachedResponseImplementation, storeResponseImplementation } from './storage.operations';

// Re-export singleton management
export { initializeIdempotency, getIdempotencyManager, shutdownIdempotency } from './singleton';

// Re-export middleware integration
export { registerOnSendHook, checkIdempotencyCache } from './middleware';
