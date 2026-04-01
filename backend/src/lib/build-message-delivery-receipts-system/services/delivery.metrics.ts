/**
 * Delivery Metrics Service
 *
 * Aggregated metrics for message delivery performance.
 */

import { prisma } from '../../prisma';
import { MessageStatus } from '@prisma/client';
import type { DeliveryMetrics, ReceiptQuery } from '../types';

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
