import type { DlqEntry, DlqQueryOptions } from './dlq.types';
import { getRedisClient } from './dlq.redis.client';
import { getAllDlqStreamKeys } from './stream.operations';

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

  const streamKeys = messageType
    ? [getDlqStreamKey(messageType)]
    : await getAllDlqStreamKeys();

  if (streamKeys.length === 0) {
    return { entries: [], nextOffset: null, total: 0 };
  }

  const streamKey = streamKeys[0];
  const total = await client.xlen(streamKey);

  let result: any;
  if (newestFirst) {
    result = offset
      ? await client.xrevrange(streamKey, `(${offset}`, '+', 'COUNT', limit)
      : await client.xrevrange(streamKey, '+', '-', 'COUNT', limit);
  } else {
    result = offset
      ? await client.xrange(streamKey, offset, '+', 'COUNT', limit)
      : await client.xrange(streamKey, '-', '+', 'COUNT', limit);
  }

  let entries: DlqEntry[] = [];
  let nextOffset: string | null = null;

  if (result && Array.isArray(result)) {
    const parsedEntries: DlqEntry[] = [];

    for (const item of result) {
      const [id, fieldsFlat] = item;
      const fields: [string, string][] = [];
      for (let i = 0; i < fieldsFlat.length; i += 2) {
        fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
      }
      const dataField = fields.find((f) => f[0] === 'data');
      const data = dataField ? JSON.parse(dataField[1]) : null;

      if (data) {
        if (errorCategory && data.errorCategory !== errorCategory) continue;
        if (minRetries && data.retryCount < minRetries) continue;
      }

      parsedEntries.push({ id, data });
    }

    entries = parsedEntries;
    if (parsedEntries.length === limit) {
      nextOffset = entries[entries.length - 1].id;
    }
  }

  return { entries, nextOffset, total: total || 0 };
}

import { getDlqStreamKey } from './dlq.config';
