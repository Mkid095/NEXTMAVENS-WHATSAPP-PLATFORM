/**
 * Message Queue Metrics
 */

import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * Total number of jobs added to the queue
 */
export const queueJobsTotal = new Counter({
  name: 'whatsapp_platform_queue_jobs_total',
  help: 'Total number of jobs added to the queue',
  labelNames: ['message_type', 'priority'],
});

/**
 * Number of currently processing jobs
 */
export const queueJobsActive = new Gauge({
  name: 'whatsapp_platform_queue_jobs_active',
  help: 'Number of currently processing jobs',
});

/**
 * Total number of jobs completed successfully
 */
export const queueJobsCompletedTotal = new Counter({
  name: 'whatsapp_platform_queue_jobs_completed_total',
  help: 'Total number of jobs completed successfully',
  labelNames: ['message_type'],
});

/**
 * Total number of jobs failed and moved to DLQ
 */
export const queueJobsFailedTotal = new Counter({
  name: 'whatsapp_platform_queue_jobs_failed_total',
  help: 'Total number of jobs failed and moved to DLQ',
  labelNames: ['failure_type'],
});

/**
 * Total number of retry attempts made
 */
export const queueJobsRetryTotal = new Counter({
  name: 'whatsapp_platform_queue_jobs_retry_total',
  help: 'Total number of retry attempts made',
  labelNames: ['message_type'],
});

/**
 * Retry delay distribution in seconds
 */
export const queueJobsRetryDelaySeconds = new Histogram({
  name: 'whatsapp_platform_queue_retry_delay_seconds',
  help: 'Retry delay distribution in seconds',
  labelNames: ['message_type', 'attempt'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
});

/**
 * Current size of the dead letter queue
 */
export const queueDlqSize = new Gauge({
  name: 'whatsapp_platform_queue_dlq_size',
  help: 'Current size of the dead letter queue',
  labelNames: ['message_type'],
});

/**
 * Total number of messages replayed from DLQ
 */
export const queueDlqReplayTotal = new Counter({
  name: 'whatsapp_platform_queue_dlq_replay_total',
  help: 'Total number of messages replayed from DLQ',
  labelNames: ['message_type'],
});

/**
 * Total number of failures by error category
 */
export const messageFailureReasonTotal = new Counter({
  name: 'whatsapp_platform_message_failure_reason_total',
  help: 'Total number of failures by error category',
  labelNames: ['message_type', 'error_category', 'reason'],
});

/**
 * Number of active worker processes
 */
export const queueWorkersActive = new Gauge({
  name: 'whatsapp_platform_queue_workers_active',
  help: 'Number of active worker processes',
});

/**
 * Time from job enqueue to completion
 */
export const queueProcessingDuration = new Histogram({
  name: 'whatsapp_platform_queue_processing_duration_seconds',
  help: 'Time from job enqueue to completion',
  labelNames: ['message_type'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
});
