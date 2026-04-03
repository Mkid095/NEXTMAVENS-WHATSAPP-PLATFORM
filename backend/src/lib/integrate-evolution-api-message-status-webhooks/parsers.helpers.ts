/**
 * Webhook Parser Helpers
 *
 * Individual functions to parse specific Evolution API webhook events.
 */

import type { ParsedWebhookEvent } from './types';
import type {
  MessageUpsertData,
  MessageUpdateData,
  MessageDeleteData,
  ConnectionUpdateData,
  QRCodeUpdateData,
  SendMessageData,
} from './types';
import type {
  ParsedMessageUpsertEvent,
  ParsedMessageUpdateEvent,
  ParsedMessageDeleteEvent,
  ParsedConnectionUpdateEvent,
  ParsedQRCodeUpdateEvent,
  ParsedSendMessageEvent,
} from './types';

/**
 * Parse MESSAGES_UPSERT event
 */
export function parseMessageUpsert(
  instanceId: string,
  data: MessageUpsertData,
  timestampMs: number | undefined
): ParsedMessageUpsertEvent {
  const { id, from, to, type, key, body, base64, state, mediaUrl, caption } = data;
  // Derive chatId from key.remoteJid; fallback to from or to
  const chatId = key?.remoteJid ?? from ?? to;
  // Use body or base64 as content, or keep entire data for flexibility
  const content = body ?? base64 ?? data;
  // Map raw status (state/ack) to a string if needed
  const status = state ?? (typeof (data as any).ack === 'number' ? String((data as any).ack) : undefined);

  return {
    event: 'MESSAGES_UPSERT',
    instanceId,
    messageId: id,
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
): ParsedMessageUpdateEvent {
  const { id, status } = data;
  return {
    event: 'MESSAGES_UPDATE',
    instanceId,
    messageId: id,
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
): ParsedMessageDeleteEvent {
  const { id } = data;
  return {
    event: 'MESSAGES_DELETE',
    instanceId,
    messageId: id,
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
): ParsedConnectionUpdateEvent {
  const { status, message: rawMessage } = data as any;
  // Build a message like "status changed to: CONNECTED" if raw message missing
  const message = rawMessage ?? `status changed to: ${status}`;
  return {
    event: 'CONNECTION_UPDATE',
    instanceId,
    message,
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
): ParsedQRCodeUpdateEvent {
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
  data: SendMessageData,
  timestampMs: number | undefined
): ParsedSendMessageEvent {
  const { id, status } = data;
  return {
    event: 'SEND_MESSAGE',
    instanceId,
    messageId: id,
    status,
    timestamp: timestampMs,
    data,
  };
}
