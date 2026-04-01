import { getRedisClient } from './dlq.redis.client';
import { getAllDlqStreamKeys } from './stream.operations';
import { DLQ_CONSUMER_GROUP } from './dlq.config';

/**
 * Initialize consumer groups for DLQ streams
 */
export async function initializeDlqConsumerGroups(): Promise<void> {
  if (!isRetryDlqEnabled()) {
    return;
  }

  const client = await getRedisClient();
  const streamKeys = await getAllDlqStreamKeys();

  for (const key of streamKeys) {
    try {
      await client.xgroup('CREATE', key, DLQ_CONSUMER_GROUP, '$', 'MKSTREAM');
      console.log(`[DLQ] Created consumer group ${DLQ_CONSUMER_GROUP} for ${key}`);
    } catch (error: any) {
      if (!error.message.includes('BUSYGROUP')) {
        console.warn(`[DLQ] Failed to create consumer group for ${key}:`, error.message);
      }
    }
  }
}

/**
 * Clean old entries from DLQ streams based on retention policy
 */
export async function cleanOldDlqEntries(): Promise<number> {
  const client = await getRedisClient();
  const streamKeys = await getAllDlqStreamKeys();
  let totalCleaned = 0;

  const cutoffTime = Date.now() - DLQ_RETENTION_MS;

  for (const key of streamKeys) {
    try {
      const entries = await client.xrevrange(key, '+', '-', 'COUNT', 1000) as any;

      if (entries && Array.isArray(entries)) {
        const toDelete: string[] = [];

        for (const [id, fieldsFlat] of entries) {
          const fields: [string, string][] = [];
          for (let i = 0; i < fieldsFlat.length; i += 2) {
            fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
          }
          const timestampField = fields.find((f) => f[0] === 'timestamp');
          if (timestampField) {
            const timestamp = new Date(timestampField[1]).getTime();
            if (timestamp < cutoffTime) {
              toDelete.push(id);
            }
          }
        }

        if (toDelete.length > 0) {
          await client.xdel(key, ...toDelete);
          totalCleaned += toDelete.length;
          console.log(`[DLQ] Cleaned ${toDelete.length} old entries from ${key}`);
        }
      }
    } catch (error) {
      console.warn(`[DLQ] Failed to clean ${key}:`, error);
    }
  }

  return totalCleaned;
}

import { DLQ_RETENTION_MS } from './dlq.config';
import { isRetryDlqEnabled } from './error-classification.types';
