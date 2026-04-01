/**
 * Rate Limiter Cleanup Operations
 * Periodic cleanup of orphaned rate limit keys
 */

/**
 * Clean up expired rate limit keys implementation
 */
export async function cleanupExpiredKeysImplementation(limiter: any): Promise<void> {
  try {
    // Scan for keys with our prefix
    const cursor = 0;
    const pattern = `${limiter.config.redisPrefix}:*`;
    const [scannedCursor, keys] = await limiter.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);

    let cleaned = 0;

    for (const key of keys) {
      try {
        // Check if key has any entries older than the maximum possible window
        // Since we don't know the rule's window, we'll remove keys that are truly ancient
        // Most cleanup happens via zRemRangeByScore in check()
        const ttl = await limiter.redis.ttl(key);
        if (ttl === -1) {
          // No TTL set (shouldn't happen but just in case)
          await limiter.redis.del(key);
          cleaned++;
        }
      } catch {
        // Ignore individual key errors
      }
    }

    if (cleaned > 0) {
      console.log(`[RateLimiter] Cleaned up ${cleaned} orphaned keys`);
    }

    limiter.metrics.lastCleanup = new Date();
  } catch (error) {
    console.error('Rate limiter cleanup error:', error);
  }
}
