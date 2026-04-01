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
// Re-exports from split modules
// ============================================================================

// Types
export * from './types';

// Status utilities
export {
  calculateInstanceStatus,
  isInstanceOnline as checkInstanceOnline,
} from './status';

// Redis client management
export {
  setRedisClient,
  shutdownRedisClient,
  getRedisClient,
} from './redis.client';

// Heartbeat operations
export {
  recordHeartbeat,
  getInstanceLastSeen,
} from './heartbeat.operations';

// Status queries
export {
  getAllInstancesWithStatus,
} from './status.queries';

// Sync service
export {
  syncInstanceStatuses,
} from './sync.service';

// Scheduler
export {
  startHeartbeatScheduler,
  stopHeartbeatScheduler,
  triggerSync,
} from './scheduler';

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
