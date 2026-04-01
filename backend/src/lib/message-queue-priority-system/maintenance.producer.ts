/**
 * Message Queue Producer - Maintenance Operations
 * Queues maintenance and cleanup jobs (background priority)
 */

import { addJob } from './operations';
import { MessageType, MessagePriority } from './enums';

/**
 * Queue a database cleanup task
 * Priority: BACKGROUND
 *
 * Removes old records from specified tables. Use with caution.
 * Typically scheduled during off-peak hours.
 *
 * @param data - Cleanup configuration
 * @param data.olderThanDays - Delete records older than this many days
 * @param data.tables - Array of table names to clean
 * @param data.orgId - Optional organization ID for multi-tenant cleanup
 */
export async function queueDatabaseCleanup(data: {
  olderThanDays: number;
  tables: string[];
  orgId?: string;
}): Promise<any> {
  return await addJob(MessageType.DATABASE_CLEANUP, { ...data });
}

/**
 * Queue a cache refresh task
 * Priority: BACKGROUND
 *
 * Refreshes a specific cache key by calling a registered refresh function.
 * Useful for proactively warming caches or invalidating stale entries.
 *
 * @param data - Cache refresh configuration
 * @param data.cacheKey - The cache key to refresh
 * @param data.refreshFunction - Registered refresh function name/identifier
 * @param data.ttl - Optional TTL in milliseconds for refreshed entry
 * @param data.orgId - Optional organization ID for scoped cache
 */
export async function queueCacheRefresh(data: {
  cacheKey: string;
  refreshFunction: string;
  ttl?: number;
  orgId?: string;
}): Promise<any> {
  return await addJob(MessageType.CACHE_REFRESH, { ...data });
}
