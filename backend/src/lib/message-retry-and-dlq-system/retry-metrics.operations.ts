/**
 * Retry Metrics Operations
 *
 * Records metrics for retry attempts and DLQ movements.
 */

import { ErrorCategory } from './error-classification.types';

// Import metrics lazily to avoid circular dependencies
let retryMetrics: any = null;
let dlqMetrics: any = null;

function getRetryMetrics() {
  if (!retryMetrics) {
    // Dynamic import to avoid circular deps
    const metrics = require('../create-comprehensive-metrics-dashboard-(grafana)/index');
    retryMetrics = {
      queueJobsRetryTotal: metrics.queueJobsRetryTotal,
      queueJobsRetryDelaySeconds: metrics.queueJobsRetryDelaySeconds || createRetryDelayHistogram()
    };
  }
  return retryMetrics;
}

function createRetryDelayHistogram() {
  const { Histogram } = require('prom-client');
  const histogram = new Histogram({
    name: 'whatsapp_platform_queue_retry_delay_seconds',
    help: 'Retry delay distribution in seconds',
    labelNames: ['message_type', 'attempt'],
    buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300]
  });
  return histogram;
}

/**
 * Record retry attempt for metrics
 */
export function recordRetryAttempt(messageType: string, attempt: number, delayMs: number): void {
  try {
    const metrics = getRetryMetrics();
    const delaySeconds = delayMs / 1000;
    metrics.queueJobsRetryTotal.inc({ message_type: messageType });
    metrics.queueJobsRetryDelaySeconds.observe(
      { message_type: messageType, attempt: attempt.toString() },
      delaySeconds
    );
  } catch (error) {
    console.warn('[RetryPolicy] Failed to record retry metrics:', error);
  }
}

/**
 * Record DLQ movement for metrics
 */
export function recordDlqMove(messageType: string, errorCategory: ErrorCategory): void {
  try {
    const metrics = require('../create-comprehensive-metrics-dashboard-(grafana)/index');
    if (metrics.queueDlqSize) {
      // This is a gauge that should be incremented when messages enter DLQ
      // Note: We'll need to implement a separate collector for DLQ size that polls Redis
      // For now, we just record the event
    }
    if (metrics.messageFailureReasonTotal) {
      metrics.messageFailureReasonTotal.inc({
        message_type: messageType,
        error_category: errorCategory
      });
    }
  } catch (error) {
    console.warn('[RetryPolicy] Failed to record DLQ metrics:', error);
  }
}
