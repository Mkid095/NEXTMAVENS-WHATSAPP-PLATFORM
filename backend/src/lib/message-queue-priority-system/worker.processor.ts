/**
 * Message Queue Worker - Job Processor
 * Routes jobs to appropriate handlers and handles retry/DLQ logic
 */

import { Job } from 'bullmq';
import { MessageType } from './enums';
import {
  queueJobsActive,
  queueProcessingDuration,
  queueJobsCompletedTotal,
  queueJobsFailedTotal,
  messageFailureReasonTotal,
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';
import {
  shouldRetry,
  shouldMoveToDlq,
  calculateRetryDelay,
  recordRetryAttempt,
  recordDlqMove,
  isRetryDlqEnabled,
  classifyError
} from '../message-retry-and-dlq-system/retry-policy';
import { addToDlq } from '../message-retry-and-dlq-system/dlq';
import { createStatusHistoryEntry } from '../message-status-tracking/status-manager';
import { StatusChangeReason } from '../message-status-tracking/types';
import * as processors from './processors';

// Type guards
function isMessageUpsert(job: Job): boolean {
  return job.name === MessageType.MESSAGE_UPSERT;
}
function isMessageStatusUpdate(job: Job): boolean {
  return job.name === MessageType.MESSAGE_STATUS_UPDATE;
}
function isMessageDelete(job: Job): boolean {
  return job.name === MessageType.MESSAGE_DELETE;
}
function isInstanceStatusUpdate(job: Job): boolean {
  return job.name === MessageType.INSTANCE_STATUS_UPDATE;
}
function isContactUpdate(job: Job): boolean {
  return job.name === MessageType.CONTACT_UPDATE;
}
function isAnalyticsEvent(job: Job): boolean {
  return job.name === MessageType.ANALYTICS_EVENT;
}
function isWebhookEvent(job: Job): boolean {
  return job.name === MessageType.WEBHOOK_EVENT;
}
function isDatabaseCleanup(job: Job): boolean {
  return job.name === MessageType.DATABASE_CLEANUP;
}
function isCacheRefresh(job: Job): boolean {
  return job.name === MessageType.CACHE_REFRESH;
}
function isWorkflowStep(job: Job): boolean {
  return job.name === MessageType.WORKFLOW_STEP;
}

/**
 * Extract error reason for metrics aggregation
 */
function extractErrorReason(error: unknown): string {
  if (!error) return 'unknown';
  const err = error as Error;
  const msg = err.message?.toLowerCase() || '';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('connection')) return 'connection_error';
  if (msg.includes('validation')) return 'validation';
  if (msg.includes('unauthorized')) return 'unauthorized';
  if (msg.includes('not found')) return 'not_found';
  if (msg.includes('duplicate')) return 'duplicate';
  return 'other';
}

/**
 * Main job processor - routes jobs to appropriate handlers
 * Includes retry and DLQ handling
 */
export async function processJob(job: Job): Promise<void> {
  const startTime = Date.now();
  queueJobsActive.inc();

  console.log(`[QueueWorker] Processing job ${job.id} (name: ${job.name}, priority: ${job.opts?.priority}, attemptsMade: ${job.attemptsMade})`);

  try {
    // Route to appropriate processor
    if (isMessageUpsert(job)) {
      await processors.processMessageUpsert(job);
    } else if (isMessageStatusUpdate(job)) {
      await processors.processMessageStatusUpdate(job);
    } else if (isMessageDelete(job)) {
      await processors.processMessageDelete(job);
    } else if (isInstanceStatusUpdate(job)) {
      await processors.processInstanceStatusUpdate(job);
    } else if (isContactUpdate(job)) {
      await processors.processContactUpdate(job);
    } else if (isAnalyticsEvent(job)) {
      await processors.processAnalyticsEvent(job);
    } else if (isWebhookEvent(job)) {
      await processors.processWebhookEvent(job);
    } else if (isDatabaseCleanup(job)) {
      await processors.processDatabaseCleanup(job);
    } else if (isCacheRefresh(job)) {
      await processors.processCacheRefresh(job);
    } else if (isWorkflowStep(job)) {
      await processors.processWorkflowStepJob(job);
    } else {
      console.warn(`[QueueWorker] Unknown job name: ${job.name}`);
      throw new Error(`Unsupported job type: ${job.name}`);
    }

    const duration = (Date.now() - startTime) / 1000;
    queueProcessingDuration.observe({ message_type: job.name as string }, duration);
    queueJobsCompletedTotal.inc({ message_type: job.name as string });

    console.log(`[QueueWorker] Job ${job.id} completed successfully (${duration.toFixed(2)}s)`);
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const attempts = job.attemptsMade + 1;

    queueProcessingDuration.observe({ message_type: job.name as string }, duration);

    // Enhanced error handling with retry/DLQ
    if (isRetryDlqEnabled()) {
      const messageType = job.name as string;
      const moveToDlq = shouldMoveToDlq(job as { name?: string }, attempts, error);

      if (moveToDlq) {
        console.error(`[QueueWorker] Job ${job.id} failed permanently after ${attempts} attempts:`, error);

        try {
          await addToDlq(job as any, error, attempts);
          queueJobsFailedTotal.inc({ failure_type: 'dlq' });

          const errorCategory = classifyError(error);
          if (messageFailureReasonTotal) {
            messageFailureReasonTotal.inc({
              message_type: messageType,
              error_category: errorCategory as any,
              reason: extractErrorReason(error)
            });
          }
          recordDlqMove(messageType, errorCategory as any);

          console.log(`[QueueWorker] Job ${job.id} moved to DLQ with category: ${errorCategory}`);
        } catch (dlqError) {
          console.error(`[QueueWorker] Failed to move job ${job.id} to DLQ:`, dlqError);
        }
      } else {
        const retryResult = calculateRetryDelay(job as any, attempts, error);
        console.log(`[QueueWorker] Job ${job.id} will be retried with delay ${retryResult.delayMs}ms (attempt ${attempts}/${retryResult.maxAttempts})`);
        recordRetryAttempt(messageType, attempts, retryResult.delayMs);
      }
    } else {
      console.error(`[QueueWorker] Job ${job.id} failed (retry/DLQ disabled):`, error);
    }

    queueJobsFailedTotal.inc({ failure_type: (error as Error).name || 'unknown' });
    throw error;
  } finally {
    queueJobsActive.dec();
  }
}
