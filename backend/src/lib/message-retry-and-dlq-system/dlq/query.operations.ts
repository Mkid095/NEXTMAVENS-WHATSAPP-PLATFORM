/**
 * DLQ Query Operations
 * Read and query operations for DLQ entries
 */

import type { DlqEntry, DlqMetrics, DlqQueryOptions, DlqMetadata } from '../types';
import { getRedisClient } from './client';
import { getAllDlqStreamKeys } from './stream.operations';
import { pairsFromFlat, getRetryCountBucket } from './helpers';

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
  const fields = pairsFromFlat(fieldsFlat);
  const dataField = fields.find((f) => f[0] === 'data');
  const data = dataField ? JSON.parse(dataField[1]) : null;

  return { id, data };
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

    // Sample entries for category and retry count bucketing
    const sampleEntries = await client.xrevrange(key, '+', '-', 'COUNT', 10) as any;
    if (sampleEntries && Array.isArray(sampleEntries)) {
      for (const [_, fieldsFlat] of sampleEntries) {
        const fields = pairsFromFlat(fieldsFlat);
        const dataField = fields.find((f) => f[0] === 'data');
        if (dataField) {
          try {
            const data = JSON.parse(dataField[1]) as DlqMetadata;

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
