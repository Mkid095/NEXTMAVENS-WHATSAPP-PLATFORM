/**
 * Idempotency Singleton Management
 */

import type { IdempotencyConfig } from './types';
import { IdempotencyManager } from './manager.class';
import { getRedisClient } from './redis.client';

let idempotencyManager: IdempotencyManager | null = null;

/**
 * Initialize the global idempotency manager singleton
 */
export async function initializeIdempotency(config?: IdempotencyConfig): Promise<IdempotencyManager> {
  if (idempotencyManager) {
    return idempotencyManager;
  }

  idempotencyManager = new IdempotencyManager(config);
  await idempotencyManager.initialize();

  console.log('[Idempotency] Manager initialized');
  return idempotencyManager;
}

/**
 * Get the global idempotency manager instance
 */
export function getIdempotencyManager(): IdempotencyManager | null {
  return idempotencyManager;
}

/**
 * Shutdown the idempotency manager and close its Redis connection.
 * Safe to call multiple times.
 */
export async function shutdownIdempotency(): Promise<void> {
  if (idempotencyManager) {
    // Close Redis client if exists
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.quit();
      } catch (e) {
        console.warn('[Idempotency] Error closing Redis client:', (e as Error).message);
      }
    }
    idempotencyManager = null;
  }
}
