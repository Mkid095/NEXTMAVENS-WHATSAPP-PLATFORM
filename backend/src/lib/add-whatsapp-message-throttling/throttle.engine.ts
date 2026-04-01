/**
 * WhatsApp Message Throttling - Engine
 * Core throttling logic
 */

import type { ThrottleConfig, ThrottleResult } from './types';
import { KEY_MINUTE, KEY_HOUR } from './config.constants';
import { getRedisClient } from './redis.client';
import { configManager } from './config.manager';
import { incTotalRequests, incAllowed, incBlocked } from './admin.service';

/**
 * Check if a message is allowed under throttle limits.
 */
export async function checkThrottle(orgId: string, instanceId: string): Promise<ThrottleResult> {
  incTotalRequests();
  const config = configManager.getEffectiveConfig(orgId, instanceId);
  const redis = getRedisClient();
  const minKey = KEY_MINUTE(orgId, instanceId);
  const hourKey = KEY_HOUR(orgId, instanceId);

  const [minuteCount, hourCount] = await Promise.all([
    redis.zCard(minKey),
    redis.zCard(hourKey),
  ]).catch(() => [0, 0]);

  // Check minute limit
  if (config.messagesPerMinute > 0 && minuteCount >= config.messagesPerMinute) {
    incBlocked();
    const oldest = await redis.zRange(minKey, 0, 0).catch(() => []);
    const resetAt = oldest.length > 0 ? new Date(parseInt(oldest[0]) + 60_000) : new Date();
    return {
      allowed: false,
      remainingMinute: 0,
      remainingHour: Math.max(0, config.messagesPerHour - hourCount),
      resetAtMinute: resetAt,
      resetAtHour: new Date(Date.now() + 3_600_000),
      usedMinute: minuteCount,
      usedHour: hourCount,
    };
  }

  // Check hour limit
  if (config.messagesPerHour > 0 && hourCount >= config.messagesPerHour) {
    incBlocked();
    const oldest = await redis.zRange(hourKey, 0, 0).catch(() => []);
    const resetAt = oldest.length > 0 ? new Date(parseInt(oldest[0]) + 3_600_000) : new Date();
    return {
      allowed: false,
      remainingMinute: Math.max(0, config.messagesPerMinute - minuteCount),
      remainingHour: 0,
      resetAtMinute: new Date(Date.now() + 60_000),
      resetAtHour: resetAt,
      usedMinute: minuteCount,
      usedHour: hourCount,
    };
  }

  // Allowed - increment counters
  incAllowed();
  const now = Date.now();
  const member = now.toString();
  const pipeline = redis.multi();
  pipeline.zAdd(minKey, [{ score: now, value: member }]);
  pipeline.zAdd(hourKey, [{ score: now, value: member }]);
  pipeline.expire(minKey, 120);
  pipeline.expire(hourKey, 7200);
  await pipeline.exec().catch(() => {});

  return {
    allowed: true,
    remainingMinute: Math.max(0, config.messagesPerMinute - minuteCount - 1),
    remainingHour: Math.max(0, config.messagesPerHour - hourCount - 1),
    resetAtMinute: new Date(Date.now() + 60_000),
    resetAtHour: new Date(Date.now() + 3_600_000),
    usedMinute: minuteCount + 1,
    usedHour: hourCount + 1,
  };
}

/**
 * Get current throttle status without incrementing
 */
export async function getStatus(orgId: string, instanceId: string): Promise<ThrottleResult> {
  const config = configManager.getEffectiveConfig(orgId, instanceId);
  const redis = getRedisClient();
  const [minuteCount, hourCount] = await Promise.all([
    redis.zCard(KEY_MINUTE(orgId, instanceId)),
    redis.zCard(KEY_HOUR(orgId, instanceId)),
  ]).catch(() => [0, 0]);

  return {
    allowed: minuteCount < config.messagesPerMinute && hourCount < config.messagesPerHour,
    remainingMinute: Math.max(0, config.messagesPerMinute - minuteCount),
    remainingHour: Math.max(0, config.messagesPerHour - hourCount),
    resetAtMinute: new Date(Date.now() + 60_000),
    resetAtHour: new Date(Date.now() + 3_600_000),
    usedMinute: minuteCount,
    usedHour: hourCount,
  };
}
