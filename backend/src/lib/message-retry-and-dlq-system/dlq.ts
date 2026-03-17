/**
 * Dead Letter Queue (DLQ) Storage
 * Uses Redis Streams to store failed message jobs with metadata
 */

import Redis from 'ioredis';
import {
  DlqMetadata,
  DlqEntry,
  DlqQueryOptions,
  DlqMetrics,
  ErrorCategory,
  FEATURE_FLAG_RETRY_DLQ,
  isRetryDlqEnabled
} from './types';

// ============================================================================
// Redis Configuration
// ============================================================================

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

export const redisConnectionOptions: any = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

// ============================================================================
// DLQ Configuration
// ============================================================================

const DLQ_STREAM_PREFIX = process.env.DLQ_STREAM_PREFIX || 'dlq:whatsapp';
const DLQ_RETENTION_DAYS = parseInt(process.env.DLQ_RETENTION_DAYS || '30', 10);
const DLQ_RETENTION_MS = DLQ_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Get the Redis stream key for a specific message type
 */
export function getDlqStreamKey(messageType: string): string {
  return `${DLQ_STREAM_PREFIX}:${messageType}`;
}

/**
 * Get the consumer group name for DLQ workers
 */
export const DLQ_CONSUMER_GROUP = 'dlq-workers';

// ============================================================================
// Redis Client
// ============================================================================

let redisClient: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    redisClient = new Redis(redisConnectionOptions);
  }
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// ============================================================================
// DLQ Operations
// ============================================================================

/**
 * Store a failed job in the DLQ
 *
 * @param job - The failed BullMQ job
 * @param error - The error that caused the failure
 * @param retryCount - Number of retry attempts made
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
    jobOptions: job.opts ? {
      priority: job.opts.priority
    } : undefined,
    stackTrace: error instanceof Error ? error.stack : undefined
  };

  // Add to Redis stream
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
 * Retrieve a single DLQ entry by Redis stream entry ID
 */
export async function getDlqEntry(streamKey: string, entryId: string): Promise<DlqEntry | null> {
  const client = await getRedisClient();

  const result = await client.xrange(
    streamKey,
    entryId,
    entryId,
    'COUNT',
    1
  ) as [string, string[]][] | null;

  if (!result || result.length === 0) {
    return null;
  }

  const [id, fieldsFlat] = result[0];
  // Convert flat array [k1, v1, k2, v2] to pairs [[k1, v1], [k2, v2]]
  const fields: [string, string][] = [];
  for (let i = 0; i < fieldsFlat.length; i += 2) {
    fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
  }
  const dataField = fields.find((f) => f[0] === 'data');
  const data = dataField ? JSON.parse(dataField[1]) : null;

  return {
    id,
    data
  };
}

/**
 * List DLQ entries with filtering and pagination
 */
export async function listDlqEntries(options: DlqQueryOptions): Promise<{
  entries: DlqEntry[];
  nextOffset: string | null;
  total: number;
}> {
  const client = await getRedisClient();
  const { messageType, errorCategory, minRetries, limit = 50, offset, newestFirst = true } = options;

  // Determine which streams to query
  const streamKeys = messageType
    ? [getDlqStreamKey(messageType)]
    : await getAllDlqStreamKeys();

  if (streamKeys.length === 0) {
    return { entries: [], nextOffset: null, total: 0 };
  }

  // For simplicity, we'll query the first stream or aggregate results
  // In production, you might want to query all streams and merge
  const streamKey = streamKeys[0];

  // Get total count (approximate using XLEN)
  const total = await client.xlen(streamKey);

  let result: any;
  if (newestFirst) {
    if (offset) {
      result = await client.xrevrange(streamKey, `(${offset}`, '+', 'COUNT', limit);
    } else {
      result = await client.xrevrange(streamKey, '+', '-', 'COUNT', limit);
    }
  } else {
    if (offset) {
      result = await client.xrange(streamKey, offset, '+', 'COUNT', limit);
    } else {
      result = await client.xrange(streamKey, '-', '+', 'COUNT', limit);
    }
  }

  let entries: DlqEntry[] = [];
  let nextOffset: string | null = null;

  if (result && Array.isArray(result)) {
    const parsedEntries: DlqEntry[] = [];

    for (const item of result) {
      const [id, fieldsFlat] = item;
      // Convert flat array [k1, v1, k2, v2] to pairs
      const fields: [string, string][] = [];
      for (let i = 0; i < fieldsFlat.length; i += 2) {
        fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
      }
      const dataField = fields.find((f) => f[0] === 'data');
      const data = dataField ? JSON.parse(dataField[1]) : null;

      // Apply filters
      if (data) {
        if (errorCategory && data.errorCategory !== errorCategory) {
          continue;
        }
        if (minRetries && data.retryCount < minRetries) {
          continue;
        }
      }

      parsedEntries.push({ id, data });
    }

    entries = parsedEntries;
    if (parsedEntries.length === limit) {
      // There might be more results
      nextOffset = entries[entries.length - 1].id;
    }
  }

  return { entries, nextOffset, total: total || 0 };
}

/**
 * Get all DLQ stream keys (for listing/monitoring)
 */
export async function getAllDlqStreamKeys(): Promise<string[]> {
  const client = await getRedisClient();

  // Scan for keys matching the DLQ pattern
  const streamKeys: string[] = [];
  let cursor = '0';

  do {
    const [newCursor, keys] = await client.scan(
      cursor,
      'MATCH',
      `${DLQ_STREAM_PREFIX}:*`,
      'COUNT',
      100
    ) as [string, string[]];

    cursor = newCursor;
    streamKeys.push(...keys);
  } while (cursor !== '0');

  return streamKeys;
}

/**
 * Get DLQ metrics (counts by type, category, etc.)
 */
export async function getDlqMetrics(): Promise<DlqMetrics> {
  const client = await getRedisClient();
  const streamKeys = await getAllDlqStreamKeys();

  const metrics: DlqMetrics = {
    total: 0,
    byMessageType: {},
    byErrorCategory: {},
    byRetryCount: {}
  };

  for (const key of streamKeys) {
    const count = await client.xlen(key);
    metrics.total += count;

    // Extract message type from key
    const parts = key.split(':');
    const messageType = parts[parts.length - 1];
    metrics.byMessageType[messageType] = (metrics.byMessageType[messageType] || 0) + count;

    // For category and retry count, we need to sample entries
    // In production, you might maintain separate counters
    const sampleEntries = await client.xrevrange(key, '+', '-', 'COUNT', 10) as any;
    if (sampleEntries && Array.isArray(sampleEntries)) {
      for (const [_, fieldsFlat] of sampleEntries) {
        // Convert flat array to pairs
        const fields: [string, string][] = [];
        for (let i = 0; i < fieldsFlat.length; i += 2) {
          fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
        }
        const dataField = fields.find((f) => f[0] === 'data');
        if (dataField) {
          try {
            const data: DlqMetadata = JSON.parse(dataField[1]);

            // Category count
            metrics.byErrorCategory[data.errorCategory] =
              (metrics.byErrorCategory[data.errorCategory] || 0) + 1;

            // Retry count bucket
            const bucket = getRetryCountBucket(data.retryCount);
            metrics.byRetryCount[bucket] = (metrics.byRetryCount[bucket] || 0) + 1;
          } catch (e) {
            // Skip malformed entries
          }
        }
      }
    }
  }

  return metrics;
}

/**
 * Get retry count bucket for aggregation
 */
function getRetryCountBucket(retryCount: number): string {
  if (retryCount === 0) return '0';
  if (retryCount === 1) return '1';
  if (retryCount === 2) return '2';
  if (retryCount <= 5) return '3-5';
  if (retryCount <= 10) return '6-10';
  return '10+';
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
  // XDEL can delete multiple entries at once
  const result = await client.xdel(streamKey, ...entryIds);
  return result;
}

/**
 * Clear entire DLQ stream (dangerous operation)
 */
export async function clearDlqStream(streamKey: string): Promise<number> {
  const client = await getRedisClient();

  // Get all entries first to return count
  const entries = await client.xrevrange(streamKey, '+', '-', 'COUNT', 1000);
  const count = entries ? entries.length : 0;

  // Delete the stream
  await client.del(streamKey);

  return count;
}

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

// ============================================================================
// DLQ Consumer Group Setup
// ============================================================================

/**
 * Initialize consumer groups for DLQ streams
 * This should be called during system startup
 */
export async function initializeDlqConsumerGroups(): Promise<void> {
  if (!isRetryDlqEnabled()) {
    return;
  }

  const client = await getRedisClient();
  const streamKeys = await getAllDlqStreamKeys();

  for (const key of streamKeys) {
    try {
      // Create consumer group if it doesn't exist
      // Using $ as the last delivered ID means "start from current end"
      await client.xgroup(
        'CREATE',
        key,
        DLQ_CONSUMER_GROUP,
        '$',
        'MKSTREAM'
      );
      console.log(`[DLQ] Created consumer group ${DLQ_CONSUMER_GROUP} for ${key}`);
    } catch (error: any) {
      // Ignore error if group already exists (BUSYGROUP error)
      if (!error.message.includes('BUSYGROUP')) {
        console.warn(`[DLQ] Failed to create consumer group for ${key}:`, error.message);
      }
    }
  }
}

// ============================================================================
// Maintenance Operations
// ============================================================================

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
      // Get all entries (up to a reasonable limit)
      const entries = await client.xrevrange(key, '+', '-', 'COUNT', 1000) as any;

      if (entries && Array.isArray(entries)) {
        const toDelete: string[] = [];

        for (const [id, fieldsFlat] of entries) {
          // Convert flat array to pairs
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

// Helper to import classifyError from retry-policy
function classifyError(error: unknown): ErrorCategory {
  // We'll dynamically import to avoid circular dependency
  // For now, return UNKNOWN - this will be properly wired in index.ts
  return (require('./retry-policy').classifyError || classifyErrorDefault)(error);
}

function classifyErrorDefault(error: unknown): ErrorCategory {
  return (error as any)?.statusCode === 404 ? ErrorCategory.PERMANENT : ErrorCategory.TRANSIENT;
}
