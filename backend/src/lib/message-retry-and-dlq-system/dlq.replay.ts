/**
 * DLQ Replay Utilities
 *
 * Replay failed messages from DLQ back to the main queue.
 */

import { getDlqStreamKey } from './dlq';

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
