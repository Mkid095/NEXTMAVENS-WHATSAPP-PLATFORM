/**
 * Instance Heartbeat Monitoring System
 *
 * Provides real-time health monitoring for WhatsApp instances using Redis TTL
 * and PostgreSQL persistence.
 *
 * Features:
 * - Push-based heartbeat (instances call POST /:id/heartbeat)
 * - Redis TTL auto-expiration for online detection
 * - PostgreSQL heartbeatStatus sync
 * - Background job for status updates
 * - Admin API for viewing instance status
 */

// ============================================================================
// Imports for local use and re-exports
// ============================================================================

// Types - re-export all
export * from './types.ts';

// Status utilities
import {
  calculateInstanceStatus,
  isInstanceOnline as isInstanceOnlineAlias,
} from './status.ts';
export { calculateInstanceStatus, isInstanceOnlineAlias as checkInstanceOnline };

// Redis client management
import {
  setRedisClient,
  shutdownRedisClient,
  getRedisClient,
} from './redis.client.ts';
export { setRedisClient, shutdownRedisClient, getRedisClient };

// Heartbeat operations
import {
  recordHeartbeat,
  getInstanceLastSeen,
} from './heartbeat.operations.ts';
export { recordHeartbeat, getInstanceLastSeen };

// Status queries
import {
  getAllInstancesWithStatus,
} from './status.queries.ts';
export { getAllInstancesWithStatus };

// Sync service
import {
  syncInstanceStatuses,
} from './sync.service.ts';
export { syncInstanceStatuses };

// Scheduler
import {
  startHeartbeatScheduler,
  stopHeartbeatScheduler,
  triggerSync,
} from './scheduler.ts';
export { startHeartbeatScheduler, stopHeartbeatScheduler, triggerSync };

// ============================================================================
// Public API convenience functions
// ============================================================================

// Functions referenced below are in scope via re-exports above

/**
 * Initialize the heartbeat monitoring system.
 * Starts the background sync job.
 */
export function initializeHeartbeatMonitoring(): void {
  startHeartbeatScheduler();
}

/**
 * Shutdown the heartbeat monitoring system.
 * Stops background jobs and closes Redis connections.
 */
export async function shutdownHeartbeatMonitoring(): Promise<void> {
  await stopHeartbeatScheduler();
  await shutdownRedisClient();
}

/**
 * Record a heartbeat from an instance.
 * This is the main function called by the heartbeat endpoint.
 */
export async function heartbeat(instanceId: string, metrics?: any): Promise<void> {
  await recordHeartbeat(instanceId, metrics);
}

/**
 * Get all instances with their current health status.
 * Used by the admin dashboard.
 */
export async function getInstancesStatus(filterOrgId?: string, filterStatus?: string): Promise<any[]> {
  return getAllInstancesWithStatus(filterOrgId, filterStatus);
}

/**
 * Manually trigger a status sync.
 */
export async function syncStatuses(): Promise<void> {
  await triggerSync();
}
