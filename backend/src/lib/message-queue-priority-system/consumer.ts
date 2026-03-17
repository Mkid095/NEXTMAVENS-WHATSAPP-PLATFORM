/**
 * Message Queue Consumer
 * Processes jobs from the priority queue using BullMQ
 */

import { Worker, Job } from 'bullmq';
import { prisma } from '../prisma';
import { getSocketService } from '../build-real-time-messaging-with-socket.io';
import { redisConnectionOptions, QUEUE_NAME, DEFAULT_CONCURRENCY } from './index';
import { MessageType } from './types';

// Import metrics (Phase 2 Step 8)
import {
  queueJobsActive,
  queueProcessingDuration,
  queueJobsCompletedTotal,
  queueJobsFailedTotal,
  messageFailureReasonTotal,
  queueJobsRetryTotal
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

// Type-only imports for Prisma enums (avoid runtime require)
import type { MessageStatus as PrismaMessageStatus, InstanceStatus as PrismaInstanceStatus, MessageType as PrismaMessageType } from '@prisma/client';

// Import retry and DLQ system (Phase 3 Step 1)
import {
  shouldRetry,
  shouldMoveToDlq,
  calculateRetryDelay,
  recordRetryAttempt,
  recordDlqMove,
  isRetryDlqEnabled
} from '../message-retry-and-dlq-system/retry-policy';
import { addToDlq, getRedisClient, initializeDlqConsumerGroups } from '../message-retry-and-dlq-system/dlq';

// Simple type guards
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

// ============================================================================
// Job Processors
// ============================================================================

async function processMessageUpsert(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.messageId || !data.chatId || !data.instanceId || !data.orgId) {
    throw new Error('Invalid message upsert job data');
  }

  const { messageId, chatId, instanceId, orgId, from, to, type, content, status, timestamp } = data;

  // Ensure chat exists
  await ensureChatExists(orgId, instanceId, chatId, from, to);

  try {
    await prisma.whatsAppMessage.create({
      data: {
        id: messageId,
        orgId,
        instanceId,
        chatId,
        messageId,
        from: from ?? 'unknown',
        to: to ?? '',
        type: type as PrismaMessageType,
        content: content ?? null,
        status: (status ?? 'PENDING') as PrismaMessageStatus,
        sentAt: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    // Broadcast
    const socketService = getSocketService();
    if (socketService) {
      await socketService.broadcastToInstance(orgId, instanceId, {
        type: 'whatsapp:message:upsert',
        data: { messageId, chatId, from, to, type, content, status: status ?? 'PENDING', timestamp: timestamp ? new Date(timestamp).getTime() : Date.now() },
      });
    }
  } catch (error: any) {
    if (error.code === 'P2002') {
      const existing = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
      if (!existing) throw new Error(`Message ${messageId} claimed duplicate but not found`);

      await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: (status ?? existing.status) as PrismaMessageStatus,
          content: content ?? undefined,
          sentAt: timestamp ? new Date(timestamp) : undefined,
        },
      });

      const socketService = getSocketService();
      if (socketService) {
        await socketService.broadcastToInstance(orgId, instanceId, {
          type: 'whatsapp:message:upsert',
          data: {
            messageId,
            chatId,
            from,
            to,
            type,
            content,
            status: status ?? existing.status,
            timestamp: timestamp ? new Date(timestamp).getTime() : existing.sentAt?.getTime() ?? Date.now(),
          },
        });
      }
    } else {
      throw error;
    }
  }
}

async function processMessageStatusUpdate(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.messageId || !data.status || !data.instanceId || !data.chatId || !data.orgId) {
    throw new Error('Invalid message status update job data');
  }

  const { messageId, status, instanceId, chatId, orgId } = data;

  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, orgId },
    select: { id: true }
  });

  if (!instance) {
    throw new Error(`Instance ${instanceId} not found or access denied for org ${orgId}`);
  }

  await prisma.whatsAppMessage.upsert({
    where: { id: messageId },
    update: { status: status as PrismaMessageStatus },
    create: {
      id: messageId,
      orgId,
      instanceId,
      chatId,
      messageId,
      from: 'unknown',
      to: '',
      type: 'text',
      status: status as PrismaMessageStatus,
      content: '',
      sentAt: new Date()
    }
  });

  const socketService = getSocketService();
  if (socketService) {
    await socketService.broadcastToInstance(orgId, instanceId, {
      type: 'whatsapp:message:update',
      data: { messageId, status, instanceId, chatId, orgId }
    });
  }
}

async function processMessageDelete(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.messageId || !data.instanceId || !data.orgId) {
    throw new Error('Invalid message delete job data');
  }

  const { messageId, instanceId, orgId } = data;

  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, orgId },
    select: { id: true }
  });

  if (!instance) {
    throw new Error(`Instance ${instanceId} not found or access denied for org ${orgId}`);
  }

  try {
    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
    await prisma.whatsAppMessage.delete({ where: { id: messageId } });

    if (message) {
      const socketService = getSocketService();
      if (socketService) {
        await socketService.broadcastToInstance(orgId, instanceId, {
          type: 'whatsapp:message:delete',
          data: { id: messageId, chatId: message.chatId }
        });
      }
    }
  } catch (error: any) {
    if (error.code === 'P2025') return;
    throw error;
  }
}

async function processInstanceStatusUpdate(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.instanceId || !data.status || !data.orgId) {
    throw new Error('Invalid instance status update job data');
  }

  const { instanceId, status, orgId } = data;

  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, orgId },
    select: { id: true }
  });

  if (!instance) {
    throw new Error(`Instance ${instanceId} not found or access denied for org ${orgId}`);
  }

  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: {
      status: status.toUpperCase() as PrismaInstanceStatus,
      lastSeen: new Date()
    }
  });

  const socketService = getSocketService();
  if (socketService) {
    await socketService.broadcastToOrg(orgId, 'whatsapp:instance:status', {
      instanceId,
      status: status.toUpperCase(),
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// Additional Job Processors for Extended Message Types
// ============================================================================

async function processContactUpdate(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.contactId || !data.instanceId || !data.orgId) {
    throw new Error('Invalid contact update job data');
  }
  const { contactId, instanceId, orgId, changes } = data;
  console.log(`[QueueWorker] Updating contact ${contactId} for instance ${instanceId}`);
  // Future: apply changes to contact in DB and notify via socket
}

async function processAnalyticsEvent(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.eventName) {
    throw new Error('Invalid analytics event job data');
  }
  const { eventName, properties } = data;
  console.log(`[QueueWorker] Analytics event: ${eventName}`, properties);
  // Future: store analytics, maybe forward to analytics service
}

async function processWebhookEvent(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.webhookId || !data.event) {
    throw new Error('Invalid webhook event job data');
  }
  const { webhookId, event } = data;
  console.log(`[QueueWorker] Webhook ${webhookId} event: ${event}`);
  // Future: deliver to webhook subscribers
}

async function processDatabaseCleanup(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.olderThanDays || !Array.isArray(data.tables)) {
    throw new Error('Invalid database cleanup job data');
  }
  const { olderThanDays, tables } = data;
  console.log(`[QueueWorker] Database cleanup: delete from ${tables.join(', ')} older than ${olderThanDays} days`);
  // Future: perform cleanup via Prisma raw queries
}

async function processCacheRefresh(job: Job): Promise<void> {
  const data = job.data as any;
  if (!data || !data.cacheKey || !data.refreshFunction) {
    throw new Error('Invalid cache refresh job data');
  }
  const { cacheKey, refreshFunction } = data;
  console.log(`[QueueWorker] Cache refresh: ${cacheKey} via ${refreshFunction}`);
  // Future: invoke refresh function
}

// ============================================================================
// Main Processor (Enhanced with Retry & DLQ)
// ============================================================================

async function processJob(job: Job): Promise<void> {
  const startTime = Date.now();
  queueJobsActive.inc(); // Track currently processing jobs

  console.log(`[QueueWorker] Processing job ${job.id} (name: ${job.name}, priority: ${job.opts?.priority}, attemptsMade: ${job.attemptsMade})`);

  try {
    // Execute the actual job processor
    if (isMessageUpsert(job)) {
      await processMessageUpsert(job);
    } else if (isMessageStatusUpdate(job)) {
      await processMessageStatusUpdate(job);
    } else if (isMessageDelete(job)) {
      await processMessageDelete(job);
    } else if (isInstanceStatusUpdate(job)) {
      await processInstanceStatusUpdate(job);
    } else if (isContactUpdate(job)) {
      await processContactUpdate(job);
    } else if (isAnalyticsEvent(job)) {
      await processAnalyticsEvent(job);
    } else if (isWebhookEvent(job)) {
      await processWebhookEvent(job);
    } else if (isDatabaseCleanup(job)) {
      await processDatabaseCleanup(job);
    } else if (isCacheRefresh(job)) {
      await processCacheRefresh(job);
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
    const attempts = job.attemptsMade + 1; // attemptsMade is number of previous attempts

    queueProcessingDuration.observe({ message_type: job.name as string }, duration);

    // Enhanced error handling with retry/DLQ (Phase 3 Step 1)
    if (isRetryDlqEnabled()) {
      const messageType = job.name as string;
      const moveToDlq = shouldMoveToDlq(job as { name?: string }, attempts, error);

      if (moveToDlq) {
        // Job exceeded retry limit or is a permanent error - move to DLQ
        console.error(`[QueueWorker] Job ${job.id} failed permanently after ${attempts} attempts:`, error);

        try {
          await addToDlq(job as any, error, attempts);
          queueJobsFailedTotal.inc({ failure_type: 'dlq' });

          const errorCategory = (require('../message-retry-and-dlq-system/retry-policy').classifyError || classifyErrorDefault)(error) as string;
          if (messageFailureReasonTotal) {
            messageFailureReasonTotal.inc({
              message_type: messageType,
              error_category: errorCategory,
              reason: extractErrorReason(error)
            });
          }
          recordDlqMove(messageType, errorCategory);

          console.log(`[QueueWorker] Job ${job.id} moved to DLQ with category: ${errorCategory}`);
        } catch (dlqError) {
          console.error(`[QueueWorker] Failed to move job ${job.id} to DLQ:`, dlqError);
          // Still throw the original error so BullMQ tracks it as failed
        }
      } else {
        // Job should be retried by BullMQ (retry already configured on job)
        const retryResult = calculateRetryDelay(job as any, attempts, error);
        console.log(`[QueueWorker] Job ${job.id} will be retried with delay ${retryResult.delayMs}ms (attempt ${attempts}/${retryResult.maxAttempts})`);

        recordRetryAttempt(messageType, attempts, retryResult.delayMs);
      }
    } else {
      // Legacy behavior - just log and let BullMQ handle with default retry (if configured)
      console.error(`[QueueWorker] Job ${job.id} failed (retry/DLQ disabled):`, error);
    }

    // Record failure metric (always)
    queueJobsFailedTotal.inc({ failure_type: (error as Error).name || 'unknown' });

    // Throw error so BullMQ tracks the failure and applies retry delay (if configured)
    throw error;
  } finally {
    queueJobsActive.dec();
  }
}

// Helper to extract error reason for metrics
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

function classifyErrorDefault(error: unknown): string {
  try {
    const { classifyError } = require('../message-retry-and-dlq-system/retry-policy');
    return classifyError(error);
  } catch {
    return 'unknown';
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function ensureChatExists(
  orgId: string,
  instanceId: string,
  chatId: string,
  from?: string,
  to?: string
): Promise<void> {
  try {
    const phone = from?.endsWith('@c.us') ? from : to;
    if (!phone) throw new Error('Cannot determine chat phone number');

    await prisma.whatsAppChat.upsert({
      where: { id: chatId },
      update: {},
      create: { id: chatId, orgId, instanceId, chatId, phone }
    });
  } catch (error: any) {
    if (error.code !== 'P2002') throw error;
  }
}

// ============================================================================
// Worker Management
// ============================================================================

let worker: Worker | null = null;

export function startWorker(): Worker {
  if (worker) {
    console.log('[QueueWorker] Worker already running');
    return worker;
  }

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      await processJob(job);
    },
    {
      connection: redisConnectionOptions,
      concurrency: DEFAULT_CONCURRENCY
    }
  );

  worker.on('completed', (job: Job) => {
    console.log(`[QueueWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[QueueWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err: Error) => {
    console.error('[QueueWorker] Worker error:', err);
  });

  worker.on('stalled', (jobId: string) => {
    console.warn(`[QueueWorker] Job ${jobId} stalled`);
  });

  worker.on('progress', (job: Job, progress: number) => {
    console.log(`[QueueWorker] Job ${job.id} is ${progress}% complete`);
  });

  console.log(`[QueueWorker] Started with concurrency ${DEFAULT_CONCURRENCY}`);
  return worker;
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    console.log('[QueueWorker] Stopping worker...');
    await worker.close();
    worker = null;
    console.log('[QueueWorker] Worker stopped');
  }
}

export function getWorkerStatus(): {
  isRunning: boolean;
  concurrency: number;
  processedJobs: number;
  failedJobs: number;
} {
  if (!worker) {
    return { isRunning: false, concurrency: 0, processedJobs: 0, failedJobs: 0 };
  }

  // Use type assertion to access non-standard properties
  const w: any = worker;
  return {
    isRunning: true,
    concurrency: worker.concurrency,
    processedJobs: w.processedJobs || 0,
    failedJobs: w.failedJobs || 0
  };
}
