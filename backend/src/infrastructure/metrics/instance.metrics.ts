/**
 * Instance Heartbeat Metrics
 */

import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * Total heartbeats received from WhatsApp instances
 */
export const instanceHeartbeatTotal = new Counter({
  name: 'whatsapp_platform_instance_heartbeat_total',
  help: 'Total heartbeats received from WhatsApp instances',
  labelNames: ['status'], // 'online' or 'offline'
});

/**
 * Number of instances currently online
 */
export const instanceCurrentlyOnline = new Gauge({
  name: 'whatsapp_platform_instance_currently_online',
  help: 'Number of instances currently online',
});

/**
 * Age of last heartbeat per instance (seconds since last update)
 */
export const instanceHeartbeatAge = new Gauge({
  name: 'whatsapp_platform_instance_heartbeat_age_seconds',
  help: 'Age of last heartbeat per instance (seconds since last update)',
  labelNames: ['instance_id', 'organisation_id'],
});

/**
 * Duration of background sync job (syncing Redis → PostgreSQL)
 */
export const instanceBackgroundSyncDuration = new Histogram({
  name: 'whatsapp_platform_instance_background_sync_duration_seconds',
  help: 'Duration of background sync job (syncing Redis → PostgreSQL)',
  buckets: [0.1, 0.5, 1, 2.5, 5, 10],
});
