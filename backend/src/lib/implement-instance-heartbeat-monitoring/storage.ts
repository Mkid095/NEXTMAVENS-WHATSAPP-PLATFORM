import { Redis } from 'ioredis';
import { prisma } from '../prisma';
import { HeartbeatMetrics, HeartbeatConfig, DEFAULT_HEARTBEAT_CONFIG } from './types';

// Import metrics (Phase 2 Step 8)
import {
  instanceHeartbeatTotal,
  instanceHeartbeatAge,
  instanceCurrentlyOnline,
  instanceBackgroundSyncDuration
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

let sharedRedis: Redis | null = null;

export function setRedisClient(client: Redis): void {
  sharedRedis = client;
}

/**
 * Shutdown the Redis client if it was created by this module.
 * Safe to call multiple times.
 */
export async function shutdownRedisClient(): Promise<void> {
  console.log('[HeartbeatStorage] shutdownRedisClient() called, sharedRedis exists:', !!sharedRedis);
  if (sharedRedis) {
    try {
      console.log('[HeartbeatStorage] Calling sharedRedis.quit()...');
      await sharedRedis.quit();
      console.log('[HeartbeatStorage] Redis quit successful');
    } catch (e) {
      console.warn('[HeartbeatStorage] Error closing Redis client:', e);
    }
    sharedRedis = null;
  } else {
    console.log('[HeartbeatStorage] No shared Redis client to close');
  }
}

function getRedisClient(): Redis {
  console.log('[HeartbeatStorage] getRedisClient() called, sharedRedis exists:', !!sharedRedis);
  if (sharedRedis) {
    console.log('[HeartbeatStorage] Returning existing sharedRedis connection');
    return sharedRedis;
  }

  // Try to get from queue system (similar to rate limiter)
  try {
    console.log('[HeartbeatStorage] Attempting to reuse queue system Redis connection...');
    const queueModule = require('../message-queue-priority-system');
    const redisOptions = queueModule.redisConnectionOptions || queueModule.default?.redisConnectionOptions;
    if (redisOptions) {
      console.log('[HeartbeatStorage] Found queue system Redis options, creating new connection with reused config');
      sharedRedis = new Redis(redisOptions);
      return sharedRedis;
    }
    console.log('[HeartbeatStorage] Queue system Redis options not found');
  } catch (e) {
    console.log('[HeartbeatStorage] Failed to get queue system Redis:', e);
    // ignore, fallback below
  }

  // Fallback: create from env
  console.log('[HeartbeatStorage] Creating Redis connection from environment variables');
  const port = parseInt(process.env.REDIS_PORT || '6381', 10);
  sharedRedis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return sharedRedis;
}

const HEARTBEAT_KEY_PREFIX = 'heartbeat:';
const METRICS_KEY_PREFIX = 'heartbeat:metrics:';

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
  // Use a transaction to ensure same connection and atomic RLS setup
  await prisma.$transaction(async (tx) => {
    // First, fetch the instance's orgId to set RLS context
    const instance = await tx.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { orgId: true },
    });

    if (!instance) {
      throw new Error('Instance not found');
    }

    // Set RLS context for this org
    await tx.$executeRaw`SELECT set_config('app.current_org', ${instance.orgId}::text, false)`;

    // Now update lastSeen and status
    await tx.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        lastSeen: new Date(now),
        heartbeatStatus: 'ONLINE',
      },
    });
  });
}

export async function getInstanceLastSeen(instanceId: string): Promise<Date | null> {
  const redis = getRedisClient();
  const val = await redis.get(`${HEARTBEAT_KEY_PREFIX}${instanceId}`);
  if (!val) return null;
  return new Date(parseInt(val, 10));
}

export async function isInstanceOnline(
  instanceId: string,
  now: Date = new Date(),
  config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG
): Promise<boolean> {
  const lastSeen = await getInstanceLastSeen(instanceId);
  if (!lastSeen) return false;
  return (now.getTime() - lastSeen.getTime()) / 1000 < config.onlineThreshold;
}

export async function getAllInstancesWithStatus(
  filterOrgId?: string,
  filterStatus?: string
): Promise<any[]> {
  const redis = getRedisClient();

  // Scan all heartbeat keys
  const stream = redis.scanStream({
    match: `${HEARTBEAT_KEY_PREFIX}*`,
    count: 100,
  });

  const onlineMap = new Map<string, number>(); // instanceId -> timestamp

  for await (const keys of stream) {
    for (const key of keys) {
      const instanceId = key.slice(HEARTBEAT_KEY_PREFIX.length);
      const val = await redis.get(key);
      if (val) {
        onlineMap.set(instanceId, parseInt(val, 10));
      }
    }
  }

  // Fetch all instances from DB (with RLS filtering)
  const where: any = {};
  if (filterOrgId) {
    where.orgId = filterOrgId;
  }

  const instances = await prisma.whatsAppInstance.findMany({
    where,
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      orgId: true,
      org: { select: { name: true, id: true } },
      lastSeen: true,
      heartbeatStatus: true,
    },
    orderBy: { name: 'asc' },
  });

  // Merge Redis status with DB data
  const now = Date.now();
  const result = instances.map((inst) => {
    const lastSeenMs = onlineMap.get(inst.id);
    const lastSeen = lastSeenMs ? new Date(lastSeenMs) : inst.lastSeen;
    const diffSec = lastSeen ? (now - lastSeen.getTime()) / 1000 : Infinity;

    let status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
    if (!lastSeen || diffSec >= DEFAULT_HEARTBEAT_CONFIG.ttl) {
      status = inst.heartbeatStatus === 'UNKNOWN' ? 'UNKNOWN' : 'OFFLINE';
    } else if (diffSec < DEFAULT_HEARTBEAT_CONFIG.onlineThreshold) {
      status = 'ONLINE';
    } else {
      status = 'OFFLINE';
    }

    return {
      id: inst.id,
      name: inst.name,
      phoneNumber: inst.phoneNumber,
      orgId: inst.orgId,
      orgName: inst.org?.name || '',
      status,
      lastSeen: lastSeen || null,
    };
  });

  // Apply status filter if provided
  if (filterStatus) {
    return result.filter((r) => r.status === filterStatus);
  }

  return result;
}

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

  // Bulk update heartbeatStatus in PostgreSQL
  // Must set RLS context: background job runs without request pipeline,
  // so we explicitly set SUPER_ADMIN role to bypass tenant isolation
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;

    // Reset all to OFFLINE first
    await tx.whatsAppInstance.updateMany({
      data: { heartbeatStatus: 'OFFLINE' },
    });

    // Set online ones to ONLINE in a single bulk operation
    if (onlineInstanceIds.size > 0) {
      await tx.whatsAppInstance.updateMany({
        where: {
          id: { in: Array.from(onlineInstanceIds) },
        },
        data: { heartbeatStatus: 'ONLINE' },
      });
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
