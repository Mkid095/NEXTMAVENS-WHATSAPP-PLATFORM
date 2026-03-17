/**
 * JSON Schema Validators for Evolution API Webhooks
 *
 * Defines validation schemas for incoming webhook payloads
 *
 * Uses JSON Schema draft 7 compatible with Fastify/Ajv
 */

import { EvolutionEventType } from './types';

// ============================================================================
// Root Webhook Schema
// ============================================================================

export const webhookBodySchema = {
  type: 'object',
  required: ['event', 'instanceId'],
  properties: {
    event: {
      type: 'string',
      enum: getAllowedEvents(),
      description: 'Evolution API event type',
    },
    instanceId: {
      type: 'string',
      minLength: 1,
      description: 'Evolution API instance identifier',
    },
    eventId: {
      type: 'string',
      nullable: true,
      description: 'Optional unique event ID for deduplication',
    },
    data: {
      type: 'object',
      required: [], // No required properties inside data object
      description: 'Event-specific payload data',
      additionalProperties: true, // Allow flexible structure based on event type
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'ISO 8601 timestamp from Evolution API',
    },
  },
};

function getAllowedEvents(): EvolutionEventType[] {
  return [
    'APPLICATION_STARTUP',
    'QRCODE_UPDATED',
    'CONNECTION_UPDATE',
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'MESSAGES_DELETE',
    'SEND_MESSAGE',
    'CONTACTS_UPSERT',
    'CONTACTS_UPDATE',
    'CONTACTS_DELETE',
    'CHATS_UPSERT',
    'CHATS_UPDATE',
    'CHATS_DELETE',
    'GROUPS_UPSERT',
    'GROUPS_UPDATE',
    'GROUP_PARTICIPANTS_UPDATE',
    'PRESENCE_UPDATE',
    'NEW_TOKEN',
    'TYPEBOT_START',
    'TYPEBOT_CHANGE_STATUS',
  ];
}

// ============================================================================
// Event-Specific Validation Schemas
// ============================================================================

export const messageUpsertSchema = {
  type: 'object',
  required: ['id', 'from', 'to', 'type'],
  properties: {
    id: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    body: { type: 'string', nullable: true },
    base64: { type: 'string', nullable: true },
    type: {
      type: 'string',
      enum: [
        'text',
        'image',
        'document',
        'video',
        'audio',
        'sticker',
        'location',
        'contacts',
        'button',
        'button_reply',
        'list',
        'list_reply',
        'template_button_reply',
        'product',
        'interactive_response',
        'unknown',
      ],
    },
    key: {
      type: 'object',
      properties: {
        remoteJid: { type: 'string' },
        fromMe: { type: 'boolean' },
        id: { type: 'string' },
      },
    },
    messageTimestamp: { type: 'string', format: 'date-time', nullable: true },
    context: { type: 'string', nullable: true },
    quotedMessage: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        body: { type: 'string' },
        from: { type: 'string' },
      },
      nullable: true,
    },
    forwarded: { type: 'boolean', nullable: true },
    forwardCount: { type: 'number', nullable: true },
  },
};

export const messageUpdateSchema = {
  type: 'object',
  required: ['id', 'status'],
  properties: {
    id: { type: 'string' },
    status: {
      type: 'string',
      enum: ['sent', 'delivered', 'read', 'failed', 'pending'],
    },
    timestamp: { type: 'string', format: 'date-time', nullable: true },
    body: { type: 'string', nullable: true },
  },
};

export const messageDeleteSchema = {
  type: 'object',
  required: ['id', 'from', 'to', 'type'],
  properties: {
    id: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    type: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time', nullable: true },
  },
};

export const connectionUpdateSchema = {
  type: 'object',
  required: ['connection', 'status'],
  properties: {
    connection: {
      type: 'string',
      enum: ['open', 'close', 'connecting', 'reconnecting'],
    },
    status: { type: 'string' },
  },
};

export const qrCodeUpdateSchema = {
  type: 'object',
  required: ['qrcode', 'status'],
  properties: {
    qrcode: { type: 'string' }, // Base64 image
    status: {
      type: 'string',
      enum: ['pending', 'scan', 'connected', 'expired'],
    },
  },
};

export const sendMessageSchema = {
  type: 'object',
  required: ['messageId', 'status'],
  properties: {
    messageId: { type: 'string' },
    status: { type: 'string', enum: ['success', 'failure'] },
    error: { type: 'string', nullable: true },
  },
};

// ============================================================================
// Fastify Route Schema (Complete)
// ============================================================================

/**
 * Full schema for Fastify route definition
 *
 * Use with: fastify.post('/api/webhooks/evolution', { schema: routeSchema, rawBody: true }, handler)
 */
export const routeSchema = {
  body: webhookBodySchema,
  headers: {
    type: 'object',
    properties: {
      'x-webhook-signature': {
        type: 'string',
        description: 'HMAC-SHA256 signature for verification',
      },
    },
    required: ['x-webhook-signature'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        received: { type: 'boolean' },
        processed: { type: 'boolean' },
        event: { type: 'string' },
        messageId: { type: 'string', nullable: true },
      },
    },
    400: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
  },
};
