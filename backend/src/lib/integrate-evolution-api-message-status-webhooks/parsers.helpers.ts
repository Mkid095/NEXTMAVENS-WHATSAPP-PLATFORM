/**
 * Webhook Parser Helpers
 *
 * Individual functions to parse specific Evolution API webhook events.
 */

import type { ParsedWebhookEvent } from './types';
import { EvolutionEventData, MessageUpsertData, MessageUpdateData, MessageDeleteData, ConnectionUpdateData, QRCodeUpdateData } from './types';

/**
 * Parse MESSAGES_UPSERT event
 */
export function parseMessageUpsert(
  instanceId: string,
  data: MessageUpsertData,
  timestampMs: number | undefined
): ParsedWebhookEvent {
  const { messageId, chatId, from, to, type, content, status } = data;
  return {
    event: 'MESSAGES_UPSERT',
    instanceId,
    messageId,
    chatId,
    from,
    to,
    type,
    content,
    status,
    timestamp: timestampMs,
    data,
  };
}

/**
 * Parse MESSAGES_UPDATE event
 */
export function parseMessageUpdate(
  instanceId: string,
  data: MessageUpdateData,
  timestampMs: number | undefined
): ParsedWebhookEvent {
  const { messageId, status } = data;
  return {
    event: 'MESSAGES_UPDATE',
    instanceId,
    messageId,
    status,
    timestamp: timestampMs,
    data,
  };
}

/**
 * Parse MESSAGES_DELETE event
 */
export function parseMessageDelete(
  instanceId: string,
  data: MessageDeleteData,
  timestampMs: number | undefined
): ParsedWebhookEvent {
  const { messageId } = data;
  return {
    event: 'MESSAGES_DELETE',
    instanceId,
    messageId,
    timestamp: timestampMs,
    data,
  };
}

/**
 * Parse CONNECTION_UPDATE event
 */
export function parseConnectionUpdate(
  instanceId: string,
  data: ConnectionUpdateData,
  timestampMs: number | undefined
): ParsedWebhookEvent {
  return {
    event: 'CONNECTION_UPDATE',
    instanceId,
    message: data.message,
    timestamp: timestampMs,
    data,
  };
}

/**
 * Parse QRCODE_UPDATED event
 */
export function parseQRCodeUpdate(
  instanceId: string,
  data: QRCodeUpdateData,
  timestampMs: number | undefined
): ParsedWebhookEvent {
  const { qrCode, status } = data;
  return {
    event: 'QRCODE_UPDATED',
    instanceId,
    qrCode,
    status,
    timestamp: timestampMs,
    data,
  };
}

/**
 * Parse SEND_MESSAGE event
 */
export function parseSendMessage(
  instanceId: string,
  data: any,
  timestampMs: number | undefined
): ParsedWebhookEvent {
  const { messageId, status } = data;
  return {
    event: 'SEND_MESSAGE',
    instanceId,
    messageId,
    status,
    timestamp: timestampMs,
    data,
  };
}
