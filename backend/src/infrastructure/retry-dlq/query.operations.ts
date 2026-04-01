import type { DlqEntry, DlqMetrics, DlqQueryOptions } from './dlq.types';
import { getRedisClient } from './dlq.redis.client';
import { getAllDlqStreamKeys } from './stream.operations';
import { classifyError } from './error-classification.types';

/**
 * Retrieve a single DLQ entry
 */
export async function getDlqEntry(streamKey: string, entryId: string): Promise<DlqEntry | null> {
  const client = await getRedisClient();
  const result = await client.xrange(streamKey, entryId, entryId, 'COUNT', 1) as [string, string[]][] | null;

  if (!result || result.length === 0) {
    return null;
  }

  const [id, fieldsFlat] = result[0];
  const fields: [string, string][] = [];
  for (let i = 0; i < fieldsFlat.length; i += 2) {
    fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
  }
  const dataField = fields.find((f) => f[0] === 'data');
  const data = dataField ? JSON.parse(dataField[1]) : null;

  return { id, data };
}

/**
 * Get DLQ metrics
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

    const parts = key.split(':');
    const messageType = parts[parts.length - 1];
    metrics.byMessageType[messageType] = (metrics.byMessageType[messageType] || 0) + count;

    const sampleEntries = await client.xrevrange(key, '+', '-', 'COUNT', 10) as any;
    if (sampleEntries && Array.isArray(sampleEntries)) {
      for (const [_, fieldsFlat] of sampleEntries) {
        const fields: [string, string][] = [];
        for (let i = 0; i < fieldsFlat.length; i += 2) {
          fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
        }
        const dataField = fields.find((f) => f[0] === 'data');
        if (dataField) {
          try {
            const data: any = JSON.parse(dataField[1]);
            metrics.byErrorCategory[data.errorCategory] =
              (metrics.byErrorCategory[data.errorCategory] || 0) + 1;
            const bucket = getRetryCountBucket(data.retryCount);
            metrics.byRetryCount[bucket] = (metrics.byRetryCount[bucket] || 0) + 1;
          } catch {
            // skip malformed
          }
        }
      }
    }
  }

  return metrics;
}

function getRetryCountBucket(retryCount: number): string {
  if (retryCount === 0) return '0';
  if (retryCount === 1) return '1';
  if (retryCount <= 5) return '2-5';
  if (retryCount <= 10) return '6-10';
  return '10+';
}
