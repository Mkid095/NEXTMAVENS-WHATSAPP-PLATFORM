/**
 * Redis Metrics
 */

import { Counter, Gauge } from 'prom-client';

/**
 * Total Redis commands executed
 */
export const redisCommandsTotal = new Counter({
  name: 'whatsapp_platform_redis_commands_total',
  help: 'Total Redis commands executed',
  labelNames: ['command'],
});

/**
 * Redis command execution latency
 */
export const redisCommandDuration = new Histogram({
  name: 'whatsapp_platform_redis_command_duration_seconds',
  help: 'Redis command execution latency',
  labelNames: ['command'],
  buckets: [0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1],
});

/**
 * Number of active Redis connections
 */
export const redisConnectionsActive = new Gauge({
  name: 'whatsapp_platform_redis_connections_active',
  help: 'Number of active Redis connections',
});

/**
 * Redis memory usage in bytes
 */
export const redisMemoryUsage = new Gauge({
  name: 'whatsapp_platform_redis_memory_usage_bytes',
  help: 'Redis memory usage in bytes',
});
