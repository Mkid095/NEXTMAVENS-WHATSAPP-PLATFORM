/**
 * Receipt Queries Service
 *
 * Query operations for delivery receipts.
 */

import { prisma } from '../../prisma';
import type { DeliveryReceipt, ReceiptQuery } from '../types';
import { buildReceipt } from './receipt.builder';

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
