/**
 * Message Queue Consumer
 * Processes jobs from the priority queue using BullMQ
 */

import { Worker, Job } from 'bullmq';
import { prisma } from '../prisma';
import { getSocketService } from '../build-real-time-messaging-with-socket.io';
import { redisConnectionOptions, QUEUE_NAME, DEFAULT_CONCURRENCY } from './index';
import { MessageType } from './types';

// Type-only imports for Prisma enums (avoid runtime require)
import type { MessageStatus as PrismaMessageStatus, InstanceStatus as PrismaInstanceStatus, MessageType as PrismaMessageType } from '@prisma/client';

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
// Main Processor
// ============================================================================

async function processJob(job: Job): Promise<void> {
  console.log(`[QueueWorker] Processing job ${job.id} (name: ${job.name}, priority: ${job.opts?.priority})`);

  try {
    if (isMessageUpsert(job)) {
      await processMessageUpsert(job);
    } else if (isMessageStatusUpdate(job)) {
      await processMessageStatusUpdate(job);
    } else if (isMessageDelete(job)) {
      await processMessageDelete(job);
    } else if (isInstanceStatusUpdate(job)) {
      await processInstanceStatusUpdate(job);
    } else {
      console.warn(`[QueueWorker] Unknown job name: ${job.name}`);
      throw new Error(`Unsupported job type: ${job.name}`);
    }

    console.log(`[QueueWorker] Job ${job.id} completed`);
  } catch (error) {
    console.error(`[QueueWorker] Job ${job.id} failed:`, error);
    throw error;
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
