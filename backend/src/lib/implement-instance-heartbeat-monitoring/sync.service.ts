import { prisma } from '../prisma';
import { getRedisClient, HEARTBEAT_KEY_PREFIX } from './redis.client';
import { DEFAULT_HEARTBEAT_CONFIG } from './types';
import { broadcastStatusChange } from './broadcast.service';

// Import metrics
import {
  instanceCurrentlyOnline,
  instanceBackgroundSyncDuration,
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

/**
 * Synchronize instance statuses based on Redis heartbeats
 */
export async function syncInstanceStatuses(): Promise<void> {
  const startTime = Date.now();
  const redis = getRedisClient();
  const config = DEFAULT_HEARTBEAT_CONFIG;
  const now = Date.now();

  // Scan all heartbeat keys to find recently active instances
  const stream = redis.scanStream({
    match: `${HEARTBEAT_KEY_PREFIX}*`,
    count: 100,
  });

  const onlineInstanceIds = new Set<string>();

  for await (const keys of stream) {
    for (const key of keys) {
      const instanceId = key.slice(HEARTBEAT_KEY_PREFIX.length);
      const val = await redis.get(key);
      if (val) {
        const lastSeenMs = parseInt(val, 10);
        if ((now - lastSeenMs) / 1000 < config.onlineThreshold) {
          onlineInstanceIds.add(instanceId);
        }
      }
    }
  }

  // Must set RLS context: background job runs without request pipeline,
  // so we explicitly set SUPER_ADMIN role to bypass tenant isolation
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;

    // Fetch currently ONLINE instances to detect status changes
    const previouslyOnline = new Set<string>(
      (await tx.whatsAppInstance.findMany({
        where: { heartbeatStatus: 'ONLINE' },
        select: { id: true },
      })).map((i: any) => i.id)
    );

    // Compute status changes
    const wentOffline = new Set<string>();
    const cameOnline = new Set<string>();

    for (const id of previouslyOnline) {
      if (!onlineInstanceIds.has(id)) {
        wentOffline.add(id);
      }
    }

    for (const id of onlineInstanceIds) {
      if (!previouslyOnline.has(id)) {
        cameOnline.add(id);
      }
    }

    // Apply status changes only (avoid unnecessary toggling)
    if (wentOffline.size > 0) {
      await tx.whatsAppInstance.updateMany({
        where: { id: { in: Array.from(wentOffline) } },
        data: { heartbeatStatus: 'OFFLINE' },
      });
    }

    if (cameOnline.size > 0) {
      await tx.whatsAppInstance.updateMany({
        where: { id: { in: Array.from(cameOnline) } },
        data: { heartbeatStatus: 'ONLINE' },
      });
    }

    // Broadcast status changes
    for (const instanceId of wentOffline) {
      // Fetch orgId for broadcast
      const inst = await tx.whatsAppInstance.findUnique({
        where: { id: instanceId },
        select: { orgId: true },
      });
      if (inst) {
        await broadcastStatusChange(instanceId, inst.orgId, 'OFFLINE', new Date(now));
      }
    }

    for (const instanceId of cameOnline) {
      // Fetch orgId for broadcast
      const inst = await tx.whatsAppInstance.findUnique({
        where: { id: instanceId },
        select: { orgId: true },
      });
      if (inst) {
        await broadcastStatusChange(instanceId, inst.orgId, 'ONLINE', new Date(now));
      }
    }
  });

  // Record metrics
  try {
    instanceCurrentlyOnline.set(onlineInstanceIds.size);
    const duration = (Date.now() - startTime) / 1000;
    instanceBackgroundSyncDuration.observe(duration);
  } catch (e) {
    // Metrics may not be ready during startup
  }
}
