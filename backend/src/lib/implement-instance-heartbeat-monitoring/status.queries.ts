import { prisma } from '../prisma';
import { getRedisClient, HEARTBEAT_KEY_PREFIX } from './redis.client';
import { DEFAULT_HEARTBEAT_CONFIG } from './types';

/**
 * Get all instances with their current status
 */
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
