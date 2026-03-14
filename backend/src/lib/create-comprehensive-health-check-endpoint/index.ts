/**
 * Comprehensive Health Check System
 *
 * Provides a single endpoint (/health) that aggregates health status
 * of all critical system components: database, Redis, BullMQ queue,
 * and system resources.
 *
 * Returns: 200 if all systems healthy, 503 if any degraded/unhealthy.
 */

import { createClient, RedisClientType } from 'redis';
import { messageQueue, redisConnectionOptions } from '../message-queue-priority-system';
import { prisma } from '../prisma';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  checks: {
    database: { status: string; message?: string };
    redis: { status: string; message?: string };
    queue: { status: string; message?: string; counts?: { waiting: number; active: number; completed: number; failed: number; delayed: number } };
  };
}

/**
 * Perform all health checks and aggregate results.
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: any = {};
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // 1. Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'healthy' };
  } catch (err: any) {
    checks.database = { status: 'unhealthy', message: err.message };
    overallStatus = 'unhealthy';
  }

  // 2. Redis check
  let redisClient: RedisClientType | null = null;
  try {
    redisClient = createClient(redisConnectionOptions);
    await redisClient.connect();
    const pong = await redisClient.ping();
    if (pong === 'PONG') {
      checks.redis = { status: 'healthy' };
    } else {
      checks.redis = { status: 'degraded', message: 'Ping failed' };
      overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
    }
  } catch (err: any) {
    checks.redis = { status: 'unhealthy', message: err.message };
    overallStatus = 'unhealthy';
  } finally {
    if (redisClient) {
      await redisClient.quit();
    }
  }

  // 3. BullMQ Queue check
  try {
    const counts = await messageQueue.getJobCounts();
    checks.queue = { status: 'healthy', counts };
  } catch (err: any) {
    checks.queue = { status: 'unhealthy', message: err.message };
    overallStatus = 'unhealthy';
  }

  // 4. System metrics
  const uptime = process.uptime();
  const memory = process.memoryUsage();

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime,
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
    },
    checks: {
      database: checks.database,
      redis: checks.redis,
      queue: checks.queue,
    },
  };
}
