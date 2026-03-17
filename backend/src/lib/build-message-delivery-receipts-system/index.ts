/**
 * Message Delivery Receipts System
 * Provides structured access to message delivery status and metrics
 *
 * Integrates with existing WhatsAppMessage model and Evolution webhooks
 */

import { prisma } from '../prisma';
import { MessageStatus } from '@prisma/client';
import {
  DeliveryReceipt,
  ReceiptQuery,
  DeliveryMetrics,
  BatchStatusUpdate,
  ReceiptWebhookEvent
} from './types';

/**
 * Build a DeliveryReceipt from Prisma WhatsAppMessage
 */
export function buildReceipt(message: any): DeliveryReceipt {
  return {
    messageId: message.id,
    chatId: message.chatId,
    instanceId: message.instanceId,
    orgId: message.orgId,
    status: message.status,
    sentAt: message.sentAt,
    deliveredAt: message.deliveredAt ?? null,
    readAt: message.readAt ?? null,
    failedAt: message.failedAt ?? null,
    failureReason: message.failureReason ?? undefined,
    updatedAt: message.updatedAt
  };
}

/**
 * Get delivery receipt for a specific message
 * Throws if message not found
 */
export async function getReceipt(messageId: string, orgId: string): Promise<DeliveryReceipt> {
  const message = await prisma.whatsAppMessage.findFirst({
    where: { id: messageId, orgId },
    select: {
      id: true,
      chatId: true,
      instanceId: true,
      orgId: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      failedAt: true,
      failureReason: true,
      updatedAt: true
    }
  });

  if (!message) {
    throw new Error(`Message ${messageId} not found`);
  }

  return buildReceipt(message);
}

/**
 * Update receipt from a webhook event
 * Handles MESSAGES_UPDATE with status changes
 */
export async function updateReceiptFromEvent(event: ReceiptWebhookEvent): Promise<DeliveryReceipt> {
  const { messageId, instanceId, status, timestamp, failureReason } = event;

  // First, find the message to get orgId and enforce tenant isolation
  const message = await prisma.whatsAppMessage.findFirst({
    where: { id: messageId, instanceId },
    select: {
      id: true,
      orgId: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      failedAt: true,
      failureReason: true
    }
  });

  if (!message) {
    throw new Error(`Message ${messageId} not found for instance ${instanceId}`);
  }

  // Build update data based on status
  const updateData: any = { status };

  // Set appropriate timestamps based on status
  const now = timestamp ?? new Date();
  switch (status) {
    case 'SENT':
      updateData.sentAt = now;
      break;
    case 'DELIVERED':
      updateData.deliveredAt = now;
      // If sent but not yet, also set sentAt (edge case)
      if (!message.sentAt) {
        updateData.sentAt = now;
      }
      break;
    case 'READ':
      updateData.readAt = now;
      // Ensure delivered timestamp exists
      if (!message.deliveredAt) {
        updateData.deliveredAt = now;
      }
      break;
    case 'FAILED':
    case 'REJECTED':
      updateData.failedAt = now;
      updateData.failureReason = failureReason ?? 'Unknown failure';
      break;
  }

  const updated = await prisma.whatsAppMessage.update({
    where: { id: messageId },
    data: updateData,
    select: {
      id: true,
      chatId: true,
      instanceId: true,
      orgId: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      failedAt: true,
      failureReason: true,
      updatedAt: true
    }
  });

  return buildReceipt(updated);
}

/**
 * Batch update receipts for multiple messages
 * Useful for bulk status synchronization
 */
export async function batchUpdateReceipts(updates: BatchStatusUpdate[]): Promise<{
  updated: number;
  errors: Array<{ messageId: string; error: string }>;
}> {
  let updatedCount = 0;
  const errors: Array<{ messageId: string; error: string }> = [];

  for (const update of updates) {
    try {
      // Build update data
      const updateData: any = { status: update.status };
      const now = update.timestamp ?? new Date();

      switch (update.status) {
        case 'SENT':
          updateData.sentAt = now;
          break;
        case 'DELIVERED':
          updateData.deliveredAt = now;
          break;
        case 'READ':
          updateData.readAt = now;
          break;
        case 'FAILED':
        case 'REJECTED':
          updateData.failedAt = now;
          updateData.failureReason = update.failureReason;
          break;
      }

      await prisma.whatsAppMessage.updateMany({
        where: { id: { in: update.messageIds } },
        data: updateData
      });

      updatedCount += update.messageIds.length;
    } catch (error: any) {
      // Skip individual failures, continue with batch
      for (const messageId of update.messageIds) {
        errors.push({
          messageId,
          error: error.message
        });
      }
    }
  }

  return { updated: updatedCount, errors };
}

/**
 * Query delivery receipts with filters
 */
export async function queryReceipts(query: ReceiptQuery): Promise<{
  receipts: DeliveryReceipt[];
  total: number;
  hasMore: boolean;
}> {
  const {
    orgId,
    instanceId,
    chatId,
    messageId,
    status,
    fromDate,
    toDate,
    limit = 50,
    offset = 0
  } = query;

  // Build where clause
  const where: any = { orgId };

  if (instanceId) where.instanceId = instanceId;
  if (chatId) where.chatId = chatId;
  if (messageId) where.id = messageId;
  if (status) where.status = status;

  // Date range filtering on updatedAt
  if (fromDate || toDate) {
    where.updatedAt = {};
    if (fromDate) where.updatedAt.gte = fromDate;
    if (toDate) where.updatedAt.lte = toDate;
  }

  // Get total count
  const total = await prisma.whatsAppMessage.count({ where });

  // Fetch receipts with pagination
  const messages = await prisma.whatsAppMessage.findMany({
    where,
    select: {
      id: true,
      chatId: true,
      instanceId: true,
      orgId: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      failedAt: true,
      failureReason: true,
      updatedAt: true
    },
    orderBy: {
      updatedAt: 'desc'
    },
    take: limit + 1, // Fetch one extra to determine hasMore
    skip: offset
  });

  const receipts = messages.slice(0, limit).map(buildReceipt);
  const hasMore = messages.length > limit;

  return { receipts, total, hasMore };
}

/**
 * Get delivery metrics for an organization or specific instance
 */
export async function getDeliveryMetrics(query: ReceiptQuery): Promise<DeliveryMetrics> {
  const { orgId, instanceId, fromDate, toDate } = query;

  // Build base where
  const where: any = { orgId };
  if (instanceId) where.instanceId = instanceId;

  if (fromDate || toDate) {
    where.updatedAt = {};
    if (fromDate) where.updatedAt.gte = fromDate;
    if (toDate) where.updatedAt.lte = toDate;
  }

  // Get counts by status
  const messages = await prisma.whatsAppMessage.groupBy({
    by: ['status'],
    where,
    _count: {
      id: true
    }
  });

  // Build status breakdown
  const byStatus: Record<MessageStatus, number> = {
    PENDING: 0,
    SENDING: 0,
    SENT: 0,
    DELIVERED: 0,
    READ: 0,
    FAILED: 0,
    REJECTED: 0,
    CANCELLED: 0
  };

  for (const group of messages) {
    byStatus[group.status] = group._count.id;
  }

  const totalMessages = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  // Calculate success metrics
  const deliveredCount = byStatus.DELIVERED + byStatus.READ;
  const readCount = byStatus.READ;
  const failedCount = byStatus.FAILED + byStatus.REJECTED;
  const pendingCount = byStatus.PENDING + byStatus.SENDING;

  const deliveryRate = totalMessages > 0 ? (deliveredCount / totalMessages) * 100 : 0;

  // Calculate average delivery time by fetching messages with both sent and delivered timestamps
  const deliveryTimeMessages = await prisma.whatsAppMessage.findMany({
    where: {
      ...where,
      deliveredAt: { not: null },
      sentAt: { not: null }
    },
    select: {
      sentAt: true,
      deliveredAt: true
    }
  });

  const avgDeliveryTimeMs = deliveryTimeMessages.length > 0
    ? deliveryTimeMessages.reduce((sum, msg) => {
        const sent = msg.sentAt!.getTime();
        const delivered = msg.deliveredAt!.getTime();
        return sum + (delivered - sent);
      }, 0) / deliveryTimeMessages.length
    : 0;

  // Calculate average read time
  const readTimeMessages = await prisma.whatsAppMessage.findMany({
    where: {
      ...where,
      readAt: { not: null },
      sentAt: { not: null }
    },
    select: {
      sentAt: true,
      readAt: true
    }
  });

  const avgReadTimeMs = readTimeMessages.length > 0
    ? readTimeMessages.reduce((sum, msg) => {
        const sent = msg.sentAt!.getTime();
        const read = msg.readAt!.getTime();
        return sum + (read - sent);
      }, 0) / readTimeMessages.length
    : 0;

  // Get breakdown by instance
  const byInstance = await prisma.whatsAppMessage.groupBy({
    by: ['instanceId'],
    where,
    _count: {
      id: true
    }
  });

  // Fetch delivered and failed counts per instance
  const instanceStats: Record<string, { total: number; delivered: number; failed: number }> = {};

  for (const group of byInstance) {
    const instanceId = group.instanceId;
    if (!instanceStats[instanceId]) {
      instanceStats[instanceId] = { total: 0, delivered: 0, failed: 0 };
    }
    instanceStats[instanceId].total = group._count.id;
  }

  // Get delivered counts per instance
  const deliveredByInstance = await prisma.whatsAppMessage.groupBy({
    by: ['instanceId'],
    where: {
      ...where,
      status: { in: ['DELIVERED', 'READ'] }
    },
    _count: { id: true }
  });

  for (const group of deliveredByInstance) {
    if (!instanceStats[group.instanceId]) {
      instanceStats[group.instanceId] = { total: 0, delivered: 0, failed: 0 };
    }
    instanceStats[group.instanceId].delivered = group._count.id;
  }

  // Get failed counts per instance
  const failedByInstance = await prisma.whatsAppMessage.groupBy({
    by: ['instanceId'],
    where: {
      ...where,
      status: { in: ['FAILED', 'REJECTED'] }
    },
    _count: { id: true }
  });

  for (const group of failedByInstance) {
    if (!instanceStats[group.instanceId]) {
      instanceStats[group.instanceId] = { total: 0, delivered: 0, failed: 0 };
    }
    instanceStats[group.instanceId].failed = group._count.id;
  }

  return {
    totalMessages,
    deliveredCount,
    readCount,
    failedCount,
    pendingCount,
    deliveryRate,
    avgDeliveryTimeMs,
    avgReadTimeMs,
    byStatus,
    byInstance: instanceStats
  };
}

/**
 * Get receipt summary for a chat (list of recent messages with delivery status)
 */
export async function getChatReceipts(chatId: string, orgId: string, limit: number = 50): Promise<DeliveryReceipt[]> {
  const messages = await prisma.whatsAppMessage.findMany({
    where: { chatId, orgId },
    select: {
      id: true,
      chatId: true,
      instanceId: true,
      orgId: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      failedAt: true,
      failureReason: true,
      updatedAt: true
    },
    orderBy: {
      sentAt: 'desc'
    },
    take: limit
  });

  return messages.map(buildReceipt);
}

/**
 * Check if a message has been delivered
 */
export async function isDelivered(messageId: string, orgId: string): Promise<boolean> {
  const message = await prisma.whatsAppMessage.findFirst({
    where: { id: messageId, orgId },
    select: { status: true }
  });

  if (!message) return false;

  return ['DELIVERED', 'READ'].includes(message.status);
}

/**
 * Get pending (non-final) messages count for an instance
 */
export async function getPendingCount(instanceId: string, orgId: string): Promise<number> {
  const count = await prisma.whatsAppMessage.count({
    where: {
      instanceId,
      orgId,
      status: { in: ['PENDING', 'SENDING', 'SENT'] }
    }
  });

  return count;
}
