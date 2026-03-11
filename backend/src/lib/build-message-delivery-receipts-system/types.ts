/**
 * Message Delivery Receipts System
 * Tracks and manages WhatsApp message delivery status
 */

import { MessageStatus } from '@prisma/client';

/**
 * Detailed delivery receipt information
 */
export interface DeliveryReceipt {
  messageId: string;
  chatId: string;
  instanceId: string;
  orgId: string;
  status: MessageStatus;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  failureReason?: string;
  updatedAt: Date;
}

/**
 * Receipt query parameters
 */
export interface ReceiptQuery {
  orgId: string;
  instanceId?: string;
  chatId?: string;
  messageId?: string;
  status?: MessageStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Delivery metrics for monitoring
 */
export interface DeliveryMetrics {
  totalMessages: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  pendingCount: number;
  deliveryRate: number; // percentage
  avgDeliveryTimeMs: number; // average time from sent to delivered
  avgReadTimeMs: number; // average time from sent to read
  byStatus: Record<MessageStatus, number>;
  byInstance: Record<string, {
    total: number;
    delivered: number;
    failed: number;
  }>;
}

/**
 * Batch status update request
 */
export interface BatchStatusUpdate {
  messageIds: string[];
  status: MessageStatus;
  timestamp?: Date;
  failureReason?: string;
}

/**
 * Receipt webhook event (from Evolution API)
 */
export interface ReceiptWebhookEvent {
  event: 'MESSAGES_UPDATE' | 'MESSAGE_STATUS';
  messageId: string;
  instanceId: string;
  chatId: string;
  status: MessageStatus;
  timestamp?: Date;
  failureReason?: string;
}
