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

export * from './types';
export * from './status';
export * from './storage';
export * from './scheduler';

import { recordHeartbeat, getAllInstancesWithStatus, shutdownRedisClient } from './storage';
import { startHeartbeatScheduler, stopHeartbeatScheduler, triggerSync } from './scheduler';

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
 *
 * @param instanceId - The WhatsApp instance ID
 * @param metrics - Optional metrics (CPU, memory, queue size, uptime)
 */
export async function heartbeat(instanceId: string, metrics?: any): Promise<void> {
  await recordHeartbeat(instanceId, metrics);
}

/**
 * Get all instances with their current health status.
 * Used by the admin dashboard.
 *
 * @param filterOrgId - Optional org ID to filter by
 * @param filterStatus - Optional status filter (ONLINE, OFFLINE, UNKNOWN)
 * @returns Array of instance status views
 */
export async function getInstancesStatus(filterOrgId?: string, filterStatus?: string): Promise<any[]> {
  return getAllInstancesWithStatus(filterOrgId, filterStatus);
}

/**
 * Manually trigger a status sync (usually done by background job).
 */
export async function syncStatuses(): Promise<void> {
  await triggerSync();
}
