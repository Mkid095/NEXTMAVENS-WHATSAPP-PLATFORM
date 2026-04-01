import { listDlqEntries, requeueFromDlq } from './dlq.operations';
import { getDlqStreamKey } from './stream.operations';

/**
 * Replay DLQ entries back to main queue
 */
export async function replayDlqEntries(
  queue: any,
  options: {
    messageType?: string;
    errorCategory?: string;
    limit?: number;
  } = {}
): Promise<{ total: number; succeeded: number; failed: number }> {
  const result = await listDlqEntries({
    messageType: options.messageType,
    errorCategory: options.errorCategory as any,
    limit: options.limit || 100,
    newestFirst: false
  });

  let succeeded = 0;
  let failed = 0;

  for (const entry of result.entries) {
    try {
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
