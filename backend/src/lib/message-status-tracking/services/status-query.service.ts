/**
 * Status Query Service
 *
 * Functions for retrieving status history and current status.
 */

import { prisma } from '../../prisma';
import { MessageStatus } from '@prisma/client';
import {
  StatusHistoryEntry,
  StatusUpdateResponse,
  PaginatedStatusHistory
} from '../types';

/**
 * Get status history for a message
 */
export async function getStatusHistory(
  messageId: string,
  orgId: string,
  query: {
    limit?: number;
    offset?: string;
    fromDate?: Date;
    toDate?: Date;
    status?: MessageStatus;
    reason?: string;
  } = {}
): Promise<StatusHistoryEntry[]> {
  const limit = query.limit || 50;
  const where: any = {
    messageId,
    message: {
      orgId
    }
  };

  if (query.fromDate || query.toDate) {
    where.changedAt = {};
    if (query.fromDate) where.changedAt.gte = query.fromDate;
    if (query.toDate) where.changedAt.lte = query.toDate;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.reason) {
    where.reason = query.reason;
  }

  const orderBy = { changedAt: 'desc' as const };
  const skip = query.offset ? 1 : 0;

  const entries = await prisma.messageStatusHistory.findMany({
    where,
    orderBy,
    take: limit + 1,
    skip,
    include: {
      message: {
        select: {
          id: true,
          orgId: true
        }
      }
    }
  });

  const filtered = entries.filter(e => e.message.orgId === orgId);

  return filtered.map(e => ({
    id: e.id,
    messageId: e.messageId,
    status: e.status,
    changedAt: e.changedAt,
    changedBy: e.changedBy,
    reason: e.reason as any,
    metadata: e.metadata as Record<string, any> | null
  })).slice(0, limit);
}

/**
 * Get the latest status from history (or from message if no history)
 */
export async function getLatestStatus(messageId: string, orgId: string): Promise<{
  status: MessageStatus;
  updatedAt: Date;
  changedBy: string | null;
  reason?: string;
}> {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      status: true,
      updatedAt: true,
      orgId: true
    }
  });

  if (!message || message.orgId !== orgId) {
    throw new Error(`Message ${messageId} not found or access denied`);
  }

  return {
    status: message.status,
    updatedAt: message.updatedAt,
    changedBy: null,
    reason: 'latest_from_message'
  };
}
