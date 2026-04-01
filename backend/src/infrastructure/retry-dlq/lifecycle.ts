import { getRedisClient } from './dlq.redis.client';
import { initializeDlqConsumerGroups } from './admin.operations';
import { cleanup } from './worker.management';
import { isRetryDlqEnabled } from './error-classification.types';

/**
 * Initialize the retry and DLQ system
 */
export async function initializeRetryDlqSystem(): Promise<void> {
  console.log('[RetryDLQ] Initializing message retry and DLQ system...');

  try {
    const client = await getRedisClient();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis did not respond with PONG');
    }
    console.log('[RetryDLQ] Redis connection established');
  } catch (error) {
    console.error('[RetryDLQ] Failed to connect to Redis:', error);
    throw error;
  }

  try {
    await initializeDlqConsumerGroups();
    console.log('[RetryDLQ] DLQ consumer groups initialized');
  } catch (error) {
    console.warn('[RetryDLQ] DLQ consumer group initialization warning:', error);
  }

  const status = isRetryDlqEnabled() ? 'ENABLED' : 'DISABLED';
  console.log(`[RetryDLQ] System initialized (feature flag: ${status})`);
}

/**
 * Gracefully shutdown the retry and DLQ system
 */
export async function shutdownRetryDlqSystem(): Promise<void> {
  console.log('[RetryDLQ] Shutting down...');
  await cleanup();
  console.log('[RetryDLQ] Shutdown complete');
}
