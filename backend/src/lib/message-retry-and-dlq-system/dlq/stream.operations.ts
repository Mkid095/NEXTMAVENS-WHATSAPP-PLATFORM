/**
 * DLQ Stream Operations
 * Stream-level operations (keys, cleanup)
 */

import { getRedisClient } from './client';
import { DLQ_STREAM_PREFIX } from './config';

/**
 * Get all DLQ stream keys matching the pattern
 */
export async function getAllDlqStreamKeys(): Promise<string[]> {
  const client = await getRedisClient();
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
 * Get the stream key for a specific message type
 */
export function getDlqStreamKey(messageType: string): string {
  return `${DLQ_STREAM_PREFIX}:${messageType}`;
}

/**
 * Check if a DLQ stream exists
 */
export async function dlqStreamExists(messageType: string): Promise<boolean> {
  const client = await getRedisClient();
  const key = getDlqStreamKey(messageType);
  const type = await client.type(key);
  return type === 'stream';
}

/**
 * Get stream info (length, first/last entry IDs)
 */
export async function getDlqStreamInfo(messageType: string): Promise<{
  length: number;
  firstEntryId: string | null;
  lastEntryId: string | null;
}> {
  const client = await getRedisClient();
  const key = getDlqStreamKey(messageType);

  try {
    const info: any = await (client.xinfo as any)('STREAM', key, 'LENGTH', 'FIRST', 'LAST');
    return {
      length: info.length || 0,
      firstEntryId: info.first?.[0] || null,
      lastEntryId: info.last?.[0] || null,
    };
  } catch (error: any) {
    if (error.message?.includes('no such key')) {
      return { length: 0, firstEntryId: null, lastEntryId: null };
    }
    throw error;
  }
}
