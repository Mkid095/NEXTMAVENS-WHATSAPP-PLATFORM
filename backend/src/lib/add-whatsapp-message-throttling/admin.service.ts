/**
 * WhatsApp Message Throttling - Admin Service
 * Maintenance and monitoring operations
 */

import type { ThrottleMetrics } from './types';
import { KEY_MINUTE, KEY_HOUR } from './config.constants';
import { getRedisClient } from './redis.client';
import { configManager } from './config.manager';

/**
 * Reset throttle counters for a specific org/instance
 */
export async function resetThrottle(orgId: string, instanceId: string): Promise<boolean> {
  const redis = getRedisClient();
  const [minKey, hourKey] = [KEY_MINUTE(orgId, instanceId), KEY_HOUR(orgId, instanceId)];
  const deleted = await Promise.all([
    redis.del(minKey),
    redis.del(hourKey),
  ]).catch(() => [0, 0]);

  return (deleted[0] > 0 || deleted[1] > 0);
}

/**
 * Get current metrics
 */
export function getMetrics(): ThrottleMetrics {
  // The metrics are tracked in the throttle engine via a shared metric object?
  // For simplicity, we'll maintain metrics in a separate module state
  return throttleMetrics;
}

/**
 * Reset metrics counters
 */
export function resetMetrics(): void {
  throttleMetrics.totalRequests = 0;
  throttleMetrics.allowed = 0;
  throttleMetrics.blocked = 0;
  throttleMetrics.activeThrottles = 0;
}

/**
 * Run background cleanup of old entries from sorted sets
 * (Optional: can be called periodically)
 */
export async function cleanupOldEntries(): Promise<number> {
  // This would require scanning all keys - better to rely on TTL expiry
  return 0;
}

// Internal metrics state (shared)
let throttleMetrics: ThrottleMetrics = {
  totalRequests: 0,
  allowed: 0,
  blocked: 0,
  activeThrottles: 0,
};

/**
 * Increment total requests (called by engine)
 */
export function incTotalRequests(): void {
  throttleMetrics.totalRequests++;
}

/**
 * Increment allowed count
 */
export function incAllowed(): void {
  throttleMetrics.allowed++;
}

/**
 * Increment blocked count
 */
export function incBlocked(): void {
  throttleMetrics.blocked++;
}

/**
 * Set active throttles count
 */
export function setActiveThrottles(count: number): void {
  throttleMetrics.activeThrottles = count;
}
