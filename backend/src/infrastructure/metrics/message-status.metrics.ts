/**
 * Message Status Metrics (Phase 3 Step 2)
 */

import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * Current number of messages by status
 */
export const messageStatusDistribution = new Gauge({
  name: 'whatsapp_platform_message_status_distribution',
  help: 'Current number of messages by status',
  labelNames: ['status', 'org_id'],
});

/**
 * Total number of status transitions
 */
export const messageStatusTransitionsTotal = new Counter({
  name: 'whatsapp_platform_message_status_transitions_total',
  help: 'Total number of status transitions',
  labelNames: ['from', 'to', 'reason'],
});

/**
 * Time taken to update message status
 */
export const messageStatusUpdateDuration = new Histogram({
  name: 'whatsapp_platform_message_status_update_duration_seconds',
  help: 'Time taken to update message status',
  labelNames: ['reason'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

/**
 * Total number of status history entries created
 */
export const messageStatusHistoryEntriesTotal = new Counter({
  name: 'whatsapp_platform_message_status_history_entries_total',
  help: 'Total number of status history entries created',
  labelNames: ['reason'],
});
