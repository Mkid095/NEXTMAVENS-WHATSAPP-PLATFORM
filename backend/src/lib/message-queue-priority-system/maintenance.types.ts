/**
 * Message Queue Priority System - Maintenance Job Types
 */

import type { MessageType } from './enums';
import type { BaseJobData } from './base.types';

/**
 * Job data for database cleanup tasks
 */
export interface DatabaseCleanupJobData extends BaseJobData {
  type: MessageType.DATABASE_CLEANUP;
  payload: {
    olderThanDays: number;
    tables: string[];
    orgId?: string;
  };
}

/**
 * Job data for cache refresh tasks
 */
export interface CacheRefreshJobData extends BaseJobData {
  type: MessageType.CACHE_REFRESH;
  payload: {
    cacheKey: string;
    refreshFunction: string;
    ttl?: number;
    orgId?: string;
  };
}
