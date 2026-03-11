/**
 * Webhook Event Parsers
 *
 * Parses Evolution API webhook payloads into structured data for processing
 */

import {
  EvolutionWebhookPayload,
  EvolutionEventData,
  MessageUpsertData,
  MessageUpdateData,
  MessageDeleteData,
  ConnectionUpdateData,
  QRCodeUpdateData,
  EVOLUTION_TO_PRISMA_STATUS,
} from './types';

/**
 * Parse a webhook payload and dispatch to appropriate handler
 *
 * @param payload - Raw webhook JSON from Evolution API
 * @returns Parsed event data with standardized structure
 */
export function parseWebhookPayload(
  payload: EvolutionWebhookPayload
): ParsedWebhookEvent {
  const { event, instanceId, data } = payload;

  switch (event) {
    case 'MESSAGES_UPSERT':
      return parseMessageUpsert(instanceId, data as MessageUpsertData);

    case 'MESSAGES_UPDATE':
      return parseMessageUpdate(instanceId, data as MessageUpdateData);

    case 'MESSAGES_DELETE':
      return parseMessageDelete(instanceId, data as MessageDeleteData);

    case 'CONNECTION_UPDATE':
      return parseConnectionUpdate(instanceId, data as ConnectionUpdateData);

    case 'QRCODE_UPDATED':
      return parseQRCodeUpdate(instanceId, data as QRCodeUpdateData);

    case 'SEND_MESSAGE':
      return parseSendMessage(instanceId, data);

    case 'APPLICATION_STARTUP':
      return {
        event,
        instanceId,
        orgId: null, // Will be looked up later
        message: `Instance ${instanceId} startup detected`,
      };

    default:
      return {
        event,
        instanceId,
        orgId: null,
        message: `Unhandled event type: ${event}`,
        unhandled: true,
        rawData: data,
      };
  }
}

// ============================================================================
// Individual Event Parsers
// ============================================================================

export interface ParsedWebhookEvent {
  event: string;
  instanceId: string;
  orgId: string | null; // Filled in by instance lookup
  message?: string;
  unhandled?: boolean;
  rawData?: EvolutionEventData;
  // Message-specific fields (when applicable)
  messageId?: string;
  status?: string; // For MESSAGES_UPDATE
  chatId?: string;
  from?: string;
  to?: string;
  type?: string;
  content?: Record<string, unknown>;
}

function parseMessageUpsert(
  instanceId: string,
  data: MessageUpsertData
): ParsedWebhookEvent {
  const messageContent = buildMessageContent(data);

  return {
    event: 'MESSAGES_UPSERT',
    instanceId,
    orgId: null, // To be resolved
    messageId: data.id,
    chatId: extractChatId(data),
    from: data.from,
    to: data.to,
    type: data.type,
    content: messageContent,
    status: 'PENDING', // New messages start pending
  };
}

function parseMessageUpdate(
  instanceId: string,
  data: MessageUpdateData
): ParsedWebhookEvent {
  return {
    event: 'MESSAGES_UPDATE',
    instanceId,
    orgId: null,
    messageId: data.id,
    status: mapMessageStatus(data.status),
  };
}

function parseMessageDelete(
  instanceId: string,
  data: MessageDeleteData
): ParsedWebhookEvent {
  return {
    event: 'MESSAGES_DELETE',
    instanceId,
    orgId: null,
    messageId: data.id,
    from: data.from,
    to: data.to,
    type: data.type,
    message: `Message deleted`,
  };
}

function parseConnectionUpdate(
  instanceId: string,
  data: ConnectionUpdateData
): ParsedWebhookEvent {
  return {
    event: 'CONNECTION_UPDATE',
    instanceId,
    orgId: null,
    message: `Connection status changed to: ${data.status}`,
  };
}

function parseQRCodeUpdate(
  instanceId: string,
  data: QRCodeUpdateData
): ParsedWebhookEvent {
  return {
    event: 'QRCODE_UPDATED',
    instanceId,
    orgId: null,
    message: `QR code status: ${data.status}`,
  };
}

function parseSendMessage(
  instanceId: string,
  data: EvolutionEventData
): ParsedWebhookEvent {
  const sendData = data as Record<string, unknown>;
  return {
    event: 'SEND_MESSAGE',
    instanceId,
    orgId: null,
    messageId: sendData.messageId as string,
    status: sendData.status === 'success' ? 'SENT' : 'FAILED',
    message: `Send message ${sendData.status}`,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build internal content object from Evolution message data
 */
function buildMessageContent(data: MessageUpsertData): Record<string, unknown> {
  const content: Record<string, unknown> = {
    type: data.type,
  };

  if (data.body) {
    content.body = data.body;
  }

  if (data.base64) {
    content.base64 = data.base64;
  }

  if (data.quotedMessage) {
    content.quotedMessage = data.quotedMessage;
  }

  if (data.forwarded) {
    content.forwarded = data.forwarded;
  }

  if (data.forwardCount) {
    content.forwardCount = data.forwardCount;
  }

  if (data.context) {
    content.context = data.context;
  }

  if (data.key) {
    content.key = data.key;
  }

  if (data.messageTimestamp) {
    content.messageTimestamp = data.messageTimestamp;
  }

  return content;
}

/**
 * Extract chat ID from message data
 * Evolution API may provide key.remoteJid or chatId directly
 */
function extractChatId(data: MessageUpsertData): string {
  // Try to get from key if available
  if (data.key?.remoteJid) {
    return data.key.remoteJid;
  }

  // Fallback: construct from 'to' field (for incoming) or 'from' (for outgoing)
  // WhatsApp chat ID format: phone@c.us (individual) or group-id@g.us (group)
  const phone = data.fromMe ? data.to : data.from;
  return `${phone}@c.us`; // Assume individual chat for now
}

/**
 * Map Evolution message status to our Prisma enum values
 */
function mapMessageStatus(evolutionStatus: string): string {
  const mapped = EVOLUTION_TO_PRISMA_STATUS[evolutionStatus.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  // Default fallback
  console.warn(`Unknown Evolution status: ${evolutionStatus}`);
  return 'PENDING';
}

/**
 * Convert Evolution event data to match our database schema fields
 */
export function mapToDatabaseFields(
  event: ParsedWebhookEvent,
  orgId: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    orgId,
    instanceId: event.instanceId,
    messageId: event.messageId,
    status: event.status,
  };

  if (event.chatId) base.chatId = event.chatId;
  if (event.from) base.from = event.from;
  if (event.to) base.to = event.to;
  if (event.type) base.type = event.type;
  if (event.content) base.content = event.content;

  return base;
}
