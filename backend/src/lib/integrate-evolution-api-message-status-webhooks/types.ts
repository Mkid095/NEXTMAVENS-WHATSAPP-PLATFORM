/**
 * Evolution API Webhook Types
 *
 * Type definitions for all Evolution API webhook events
 * Documentation: https://doc.evolution-api.com/v2/en/configuration/webhooks
 */

// ============================================================================
// Base Webhook Structures
// ============================================================================

export interface EvolutionWebhookPayload {
  event: EvolutionEventType;
  instanceId: string;
  /** Optional unique event ID from Evolution for deduplication */
  eventId?: string;
  /** Event-specific data */
  data: EvolutionEventData;
  /** Timestamp from Evolution API */
  timestamp?: string;
}

export type EvolutionEventType =
  | 'APPLICATION_STARTUP'
  | 'QRCODE_UPDATED'
  | 'CONNECTION_UPDATE'
  | 'MESSAGES_UPSERT'
  | 'MESSAGES_UPDATE'
  | 'MESSAGES_DELETE'
  | 'SEND_MESSAGE'
  | 'CONTACTS_UPSERT'
  | 'CONTACTS_UPDATE'
  | 'CONTACTS_DELETE'
  | 'CHATS_UPSERT'
  | 'CHATS_UPDATE'
  | 'CHATS_DELETE'
  | 'GROUPS_UPSERT'
  | 'GROUPS_UPDATE'
  | 'GROUP_PARTICIPANTS_UPDATE'
  | 'PRESENCE_UPDATE'
  | 'NEW_TOKEN'
  | 'TYPEBOT_START'
  | 'TYPEBOT_CHANGE_STATUS';

// Union type for event-specific data
export type EvolutionEventData =
  | ConnectionUpdateData
  | MessageUpsertData
  | MessageUpdateData
  | MessageDeleteData
  | SendMessageData
  | QRCodeUpdateData
  | ApplicationStartupData
  | ContactData
  | ChatData
  | GroupData
  | PresenceData
  | NewTokenData
  | TypebotStartData
  | TypebotStatusData
  | Record<string, unknown>; // Fallback for unhandled events

// ============================================================================
// Event Data Structures
// ============================================================================

export interface ConnectionUpdateData {
  instanceId: string;
  connection: string; // 'open', 'close', 'connecting', etc.
  status: string; // Full status description
}

export interface MessageUpsertData {
  /** WhatsApp message ID */
  id: string;
  /** Phone number or 'me' */
  from: string;
  to: string;
  /** Message body for text, or media URL for images */
  body?: string;
  /** Base64 encoded media if applicable */
  base64?: string;
  /** Message type */
  type: MessageType;
  /** Evolution internal ID */
  key?: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  /** Message timestamp */
  messageTimestamp?: string;
  /** Additional context */
  context?: string;
  /** Quoted message */
  quotedMessage?: {
    id: string;
    body: string;
    from: string;
  };
  /** For forwarded messages */
  forwarded?: boolean;
  /** Forward count */
  forwardCount?: number;
}

export interface MessageUpdateData {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  timestamp?: string;
  /** Optional new body if message was edited */
  body?: string;
}

export interface MessageDeleteData {
  id: string;
  from: string;
  to: string;
  type: string;
  timestamp?: string;
}

export interface SendMessageData {
  messageId: string;
  status: 'success' | 'failure';
  instanceId: string;
  /** Optional error details */
  error?: string;
}

export interface QRCodeUpdateData {
  instanceId: string;
  qrcode: string; // Base64 image
  status: 'pending' | 'scan' | 'connected' | 'expired';
}

export interface ApplicationStartupData {
  instanceId: string;
  status: string;
  version?: string;
}

export interface ContactData {
  id: string;
  name?: string;
  number: string;
  pushName?: string;
  profilePicUrl?: string;
  // Additional fields...
}

export interface ChatData {
  id: string;
  instanceId: string;
  remoteJid: string; // phone@c.us
  name?: string;
  lastMessage?: MessageUpsertData;
  unreadCount?: number;
}

export interface GroupData {
  id: string;
  subject: string;
  description?: string;
  participants: GroupParticipant[];
  created?: string;
  admin?: string[];
}

export interface GroupParticipant {
  id: string;
  name?: string;
  number: string;
  admin?: boolean;
}

export interface PresenceData {
  id: string;
  presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'typing';
}

export interface NewTokenData {
  instanceId: string;
  token: string;
}

export interface TypebotStartData {
  instanceId: string;
  typebotName: string;
  // ...
}

export interface TypebotStatusData {
  instanceId: string;
  typebotName: string;
  status: 'started' | 'stopped' | 'error';
}

// ============================================================================
// Message Type Mapping (WhatsApp)
// ============================================================================

/**
 * WhatsApp message types as sent by Evolution API
 */
export type MessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'video'
  | 'audio'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'button'
  | 'button_reply'
  | 'list'
  | 'list_reply'
  | 'template_button_reply'
  | 'product'
  | 'interactive_response'
  | 'unknown';

// ============================================================================
// Internal Processing Types
// ============================================================================

/**
 * Result of webhook processing
 */
export interface WebhookProcessingResult {
  success: boolean;
  event: EvolutionEventType;
  instanceId: string;
  orgId: string;
  messageId?: string;
  error?: string;
  processedAt: Date;
}

/**
 * Configuration for webhook processing
 */
export interface WebhookProcessorConfig {
  /** Webhook secret for signature verification */
  webhookSecret: string;
  /** Optional Redis URL for caching */
  redisUrl?: string;
  /** Whether to verify IP whitelist */
  requireIpWhitelist?: boolean;
  /** Allowed IP ranges (CIDR) */
  allowedIps?: string[];
}

// ============================================================================
// Database Types (for reference)
// ============================================================================

/**
 * Subset of WhatsAppInstance needed for webhook processing
 */
export interface InstanceInfo {
  id: string;
  orgId: string;
  status: string;
  webhookUrl?: string;
}

/**
 * Message status mapping from Evolution to our schema
 */
export const EVOLUTION_TO_PRISMA_STATUS: Record<string, string> = {
  pending: 'PENDING',
  sending: 'SENDING',
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
  rejected: 'REJECTED',
};
