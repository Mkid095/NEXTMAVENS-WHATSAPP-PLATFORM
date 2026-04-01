import { prisma } from '../prisma';
import { HeartbeatMetrics, HeartbeatConfig, DEFAULT_HEARTBEAT_CONFIG } from './types';
import { getRedisClient, HEARTBEAT_KEY_PREFIX, METRICS_KEY_PREFIX } from './redis.client';

// Import metrics
import {
  instanceHeartbeatTotal,
  instanceHeartbeatAge,
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

import { broadcastStatusChange } from './broadcast.service';

/**
 * Record a heartbeat from an instance
 */
export async function recordHeartbeat(
  instanceId: string,
  metrics?: HeartbeatMetrics,
  config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG
): Promise<void> {
  const redis = getRedisClient();
  const now = Date.now();

  // Store timestamp in Redis with TTL
  await redis.set(
    `${HEARTBEAT_KEY_PREFIX}${instanceId}`,
    now.toString(),
    'EX',
    config.ttl
  );

  // Optionally store metrics separately (expire with same TTL)
  if (metrics) {
    const metricsObj = { ...metrics, updatedAt: now };
    const fields = Object.entries(metricsObj).flat();
    // @ts-ignore - ioredis hmset signature is complex but this works
    await redis.hmset(
      `${METRICS_KEY_PREFIX}${instanceId}`,
      ...fields,
      'EX',
      config.ttl
    );
  }

  // Record metrics (best effort, ignore failures)
  try {
    instanceHeartbeatTotal.inc({ status: 'online' });
    // Also record age metric (seconds since last heartbeat, should be near 0)
    const ageSec = (Date.now() - now) / 1000;
    instanceHeartbeatAge.set({ instance_id: instanceId }, ageSec);
  } catch (e) {
    // Metrics system may not be initialized during testing or early startup
  }

  // Update PostgreSQL with proper RLS context
  await prisma.$transaction(async (tx) => {
    // First, fetch the instance's orgId and current status to check for changes
    const instance = await tx.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { orgId: true, heartbeatStatus: true },
    });

    if (!instance) {
      throw new Error('Instance not found');
    }

    // Set RLS context for this org
    await tx.$executeRaw`SELECT set_config('app.current_org', ${instance.orgId}::text, false)`;

    // Now update lastSeen and status
    const newStatus = 'ONLINE';
    await tx.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        lastSeen: new Date(now),
        heartbeatStatus: newStatus,
      },
    });

    // Broadcast if status changed to ONLINE (from OFFLINE/UNKNOWN)
    if (instance.heartbeatStatus !== newStatus) {
      await broadcastStatusChange(instanceId, instance.orgId, newStatus, new Date(now));
    }
  });
}

/**
 * Get last seen timestamp for an instance
 */
export async function getInstanceLastSeen(instanceId: string): Promise<Date | null> {
  const redis = getRedisClient();
  const val = await redis.get(`${HEARTBEAT_KEY_PREFIX}${instanceId}`);
  if (!val) return null;
  return new Date(parseInt(val, 10));
}

/**
 * Check if an instance is currently online
 */
export async function isInstanceOnline(
  instanceId: string,
  now: Date = new Date(),
  config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG
): Promise<boolean> {
  const lastSeen = await getInstanceLastSeen(instanceId);
  if (!lastSeen) return false;
  return (now.getTime() - lastSeen.getTime()) / 1000 < config.onlineThreshold;
}
