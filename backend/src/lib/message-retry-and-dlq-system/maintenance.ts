/**
 * DLQ Maintenance Utilities
 * Periodic cleanup and maintenance tasks for DLQ
 */

import { getRedisClient, cleanOldDlqEntries } from './dlq';

// ============================================================================
// Scheduled Cleanup
// ============================================================================

/**
 * Schedule periodic cleanup of old DLQ entries
 * Call this during application startup
 */
export async function scheduleDlqCleanup(intervalHours: number = 6): Promise<() => Promise<void>> {
  console.log(`[DLQMaintenance] Scheduling DLQ cleanup every ${intervalHours} hours`);

  const cleanup = async () => {
    try {
      const count = await cleanOldDlqEntries();
      if (count > 0) {
        console.log(`[DLQMaintenance] Cleaned ${count} old DLQ entries`);
      }
    } catch (error) {
      console.error('[DLQMaintenance] Cleanup failed:', error);
    }
  };

  // Run immediately once
  await cleanup();

  // Schedule recurring cleanup
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const timer = setInterval(cleanup, intervalMs);

  // Return stop function
  return async () => {
    clearInterval(timer);
    console.log('[DLQMaintenance] Cleanup scheduler stopped');
  };
}

/**
 * Get DLQ health report
 */
export async function getDlqHealthReport() {
  const client = await getRedisClient();
  const streamKeys = await (await import('./dlq')).getAllDlqStreamKeys();

  const report = {
    timestamp: new Date().toISOString(),
    totalStreams: streamKeys.length,
    streams: [] as any[],
    totalEntries: 0,
    oldestEntry: null as { stream: string; timestamp: string } | null,
    newestEntry: null as { stream: string; timestamp: string } | null
  };

  for (const key of streamKeys) {
    const count = await client.xlen(key);
    report.totalEntries += count;

    const streamInfo = {
      key,
      messageType: key.split(':').pop(),
      count,
      oldest: null as string | null,
      newest: null as string | null
    };

    if (count > 0) {
      // Get first and last entries to check age
      const oldest = await client.xrange(key, 0, 0, 'COUNT', 1);
      const newest = await client.xrevrange(key, 0, 0, 'COUNT', 1);

      if (oldest && oldest.length > 0) {
        const [id, fieldsFlat] = oldest[0] as [string, string[]];
        // Convert flat array to pairs
        const fields: [string, string][] = [];
        for (let i = 0; i < fieldsFlat.length; i += 2) {
          fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
        }
        const timeField = fields.find((f) => f[0] === 'timestamp');
        if (timeField) {
          streamInfo.oldest = timeField[1];
        }
      }

      if (newest && newest.length > 0) {
        const [id, fieldsFlat] = newest[0] as [string, string[]];
        // Convert flat array to pairs
        const fields: [string, string][] = [];
        for (let i = 0; i < fieldsFlat.length; i += 2) {
          fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
        }
        const timeField = fields.find((f) => f[0] === 'timestamp');
        if (timeField) {
          streamInfo.newest = timeField[1];
        }
      }
    }

    report.streams.push(streamInfo);
  }

  return report;
}

/**
 * Replay all DLQ entries matching filter back to main queue
 * Bulk operation with progress tracking
 */
export async function replayDlqEntries(
  queue: any,
  options: {
    messageType?: string;
    errorCategory?: string;
    limit?: number;
  } = {}
): Promise<{ total: number; succeeded: number; failed: number }> {
  const { listDlqEntries } = await import('./dlq');

  const result = await listDlqEntries({
    messageType: options.messageType,
    errorCategory: options.errorCategory as any,
    limit: options.limit || 100,
    newestFirst: false // Oldest first for replay
  });

  let succeeded = 0;
  let failed = 0;

  for (const entry of result.entries) {
    try {
      const { requeueFromDlq } = await import('./dlq');
      const streamKey = getDlqStreamKey(entry.data.messageType);
      const success = await requeueFromDlq(streamKey, entry.id, queue);
      if (success) {
        succeeded++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`[DLQReplay] Failed to replay entry ${entry.id}:`, error);
      failed++;
    }
  }

  return {
    total: result.entries.length,
    succeeded,
    failed
  };
}

function getDlqStreamKey(messageType: string): string {
  const { DLQ_STREAM_PREFIX } = require('./types');
  return `${DLQ_STREAM_PREFIX}:${messageType}`;
}
