/**
 * Receipt Updates Service
 *
 * Update operations for delivery receipts.
 */

import { prisma } from '../../prisma';
import type { DeliveryReceipt, ReceiptWebhookEvent, BatchStatusUpdate } from '../types';
import { buildReceipt } from './receipt.builder';

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
