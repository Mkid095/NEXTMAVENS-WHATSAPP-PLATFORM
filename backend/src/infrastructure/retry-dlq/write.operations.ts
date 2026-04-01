import { getRedisClient } from './dlq.redis.client';
import { getDlqStreamKey } from './stream.operations';
import { isRetryDlqEnabled } from './error-classification.types';
import type { DlqMetadata } from './dlq.types';

/**
 * Store a failed job in the DLQ
 */
export async function addToDlq(
  job: { id: string; name?: string; data: any; opts?: any },
  error: unknown,
  retryCount: number
): Promise<string> {
  if (!isRetryDlqEnabled()) {
    throw new Error('DLQ operations are disabled. Set ENABLE_RETRY_DLQ=true');
  }

  const client = await getRedisClient();
  const streamKey = getDlqStreamKey(job.name || 'MESSAGE_UPSERT');

  const metadata: DlqMetadata = {
    originalJobId: job.id,
    messageType: job.name || 'MESSAGE_UPSERT',
    error: error instanceof Error ? error.message : String(error),
    errorCategory: classifyError(error),
    retryCount,
    failedAt: new Date().toISOString(),
    payload: job.data,
    jobOptions: job.opts ? { priority: job.opts.priority } : undefined,
    stackTrace: error instanceof Error ? error.stack : undefined
  };

  const entryId = await client.xadd(
    streamKey,
    '*',
    'data',
    JSON.stringify(metadata),
    'timestamp',
    metadata.failedAt,
    'messageType',
    metadata.messageType,
    'errorCategory',
    metadata.errorCategory
  );

  console.log(`[DLQ] Added job ${job.id} to ${streamKey} with entry ID ${entryId}`);
  return entryId;
}

/**
 * Delete a specific DLQ entry
 */
export async function deleteDlqEntry(streamKey: string, entryId: string): Promise<boolean> {
  const client = await getRedisClient();
  const result = await client.xdel(streamKey, entryId);
  return result === 1;
}

/**
 * Delete multiple DLQ entries from a stream
 */
export async function deleteDlqEntries(
  streamKey: string,
  entryIds: string[]
): Promise<number> {
  if (entryIds.length === 0) return 0;

  const client = await getRedisClient();
  const result = await client.xdel(streamKey, ...entryIds);
  return result;
}

/**
 * Clear entire DLQ stream
 */
export async function clearDlqStream(streamKey: string): Promise<number> {
  const client = await getRedisClient();
  const entries = await client.xrevrange(streamKey, '+', '-', 'COUNT', 1000);
  const count = entries ? entries.length : 0;
  await client.del(streamKey);
  return count;
}

// Local classifyError for this module
function classifyError(error: unknown): string {
  return (error as any)?.statusCode === 404 ? 'permanent' : 'transient';
}
