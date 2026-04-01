import { getRedisClient } from './dlq.redis.client';
import { DLQ_STREAM_PREFIX } from './dlq.config';

/**
 * Get the Redis stream key for a specific message type
 */
export function getDlqStreamKey(messageType: string): string {
  return `${DLQ_STREAM_PREFIX}:${messageType}`;
}

/**
 * Get all DLQ stream keys
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
