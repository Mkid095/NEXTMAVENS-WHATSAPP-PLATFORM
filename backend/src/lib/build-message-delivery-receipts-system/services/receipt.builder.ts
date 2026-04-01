/**
 * Receipt Builder
 * Constructs DeliveryReceipt objects from Prisma message entities.
 */

import type { DeliveryReceipt } from '../types';

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
