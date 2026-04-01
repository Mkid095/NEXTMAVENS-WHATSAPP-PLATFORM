/**
 * DLQ Maintenance Operations
 * Re-queue and cleanup operations for DLQ
 */

import { getRedisClient } from './client';
import { getDlqStreamKey, DLQ_RETENTION_MS } from './config';
import { getAllDlqStreamKeys } from './stream.operations';
import { getDlqEntry } from './query.operations';
import { deleteDlqEntry } from './write.operations';
import { pairsFromFlat } from './helpers';

/**
 * Re-queue a DLQ entry back to the main message queue
 */
export async function requeueFromDlq(
  streamKey: string,
  entryId: string,
  queue: any // BullMQ Queue instance
): Promise<boolean> {
  const entry = await getDlqEntry(streamKey, entryId);
  if (!entry) {
    return false;
  }

  const { data } = entry;

  try {
    // Add job back to the main queue with original priority
    await queue.add(data.messageType, data.payload, {
      priority: data.jobOptions?.priority,
      ...(data.jobOptions?.deduplication && { deduplication: data.jobOptions.deduplication })
    });

    // Remove from DLQ
    await deleteDlqEntry(streamKey, entryId);

    console.log(`[DLQ] Re-queued job ${data.originalJobId} from ${streamKey} to main queue`);
    return true;
  } catch (error) {
    console.error(`[DLQ] Failed to re-queue job ${data.originalJobId}:`, error);
    return false;
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
          const fields = pairsFromFlat(fieldsFlat);
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
