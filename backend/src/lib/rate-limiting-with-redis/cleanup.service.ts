/**
 * Rate Limiting Cleanup Service
 * Handles expired key cleanup
 */

/**
 * Clean up orphaned rate limit keys
 * This is a belt-and-suspenders approach to remove any keys that have expired
 * but were not cleaned due to Redis TTL issues.
 */
export async function cleanupExpiredKeys(
  redis: any,
  prefix: string,
  batchSize: number = 1000
): Promise<number> {
  try {
    const pattern = `${prefix}:*`;
    let cleaned = 0;
    let cursor = 0;

    do {
      // Scan for keys with our prefix
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);

      for (const key of keys) {
        try {
          // Check if key has any entries older than the maximum possible window
          // Most cleanup happens via zRemRangeByScore in check()
          const ttl = await redis.ttl(key);
          if (ttl === -1) {
            // No TTL set (shouldn't happen but just in case)
            await redis.del(key);
            cleaned++;
          }
        } catch {
          // Ignore individual key errors
        }
      }

      cursor = newCursor;
    } while (cursor !== 0);

    return cleaned;
  } catch (error) {
    console.error('Rate limiter cleanup error:', error);
    return 0;
  }
}
