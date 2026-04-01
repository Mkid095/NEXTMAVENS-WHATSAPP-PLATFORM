/**
 * DLQ Consumer Group Setup
 */

import { getRedisClient } from './client';
import { DLQ_CONSUMER_GROUP } from './config';
import { getAllDlqStreamKeys } from './stream.operations';

/**
 * Initialize consumer groups for DLQ streams
 * Should be called during application startup
 */
export async function initializeDlqConsumerGroups(): Promise<void> {
  // Note: The feature flag check is done by caller if needed
  const client = await getRedisClient();
  const streamKeys = await getAllDlqStreamKeys();

  for (const key of streamKeys) {
    try {
      // Create consumer group starting from current end ($)
      await client.xgroup(
        'CREATE',
        key,
        DLQ_CONSUMER_GROUP,
        '$',
        'MKSTREAM'
      );
      console.log(`[DLQ] Created consumer group ${DLQ_CONSUMER_GROUP} for ${key}`);
    } catch (error: any) {
      // Ignore if group already exists
      if (!error.message.includes('BUSYGROUP')) {
        console.warn(`[DLQ] Failed to create consumer group for ${key}:`, error.message);
      }
    }
  }
}
