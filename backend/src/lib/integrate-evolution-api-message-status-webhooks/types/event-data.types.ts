/**
 * Event Data Types
 *
 * Type definitions for data carried by each webhook event.
 */

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

/**
 * Connection update data
 */
export interface ConnectionUpdateData {
  instanceId: string;
  connection: string;
  status: string;
}

/**
 * Message upsert data (new or updated message)
 */
export interface MessageUpsertData {
  id: string;
  from: string;
  to: string;
  body?: string;
  base64?: string;
  type: MessageType;
  key?: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  messageTimestamp?: string;
  context?: string;
  quotedMessage?: {
    id: string;
    body: string;
    from: string;
  };
}

/**
 * Message update data (status change)
 */
export interface MessageUpdateData {
  messageId: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'REJECTED';
}

/**
 * Message delete data
 */
export interface MessageDeleteData {
  messageId: string;
}

/**
 * Send message confirmation
 */
export interface SendMessageData {
  messageId: string;
  status: 'success' | 'failure';
}

/**
 * QR code update data
 */
export interface QRCodeUpdateData {
  qrCode: string;
  status?: string;
}

/**
 * Application startup data
 */
export interface ApplicationStartupData {
  instanceId: string;
}

/**
 * Contact data
 */
export interface ContactData {
  id: string;
  name?: string;
  phone?: string;
  // ... additional fields
}

/**
 * Chat data
 */
export interface ChatData {
  id: string;
  name?: string;
  phone?: string;
  // ... additional fields
}

/**
 * Group data
 */
export interface GroupData {
  id: string;
  name: string;
  participants?: GroupParticipant[];
  // ... additional fields
}

/**
 * Group participant
 */
export interface GroupParticipant {
  id: string;
  name?: string;
  phone?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
}

/**
 * Presence data
 */
export interface PresenceData {
  instanceId: string;
  status: string;
}

/**
 * New token data
 */
export interface NewTokenData {
  token: string;
}

/**
 * Typebot start data
 */
export interface TypebotStartData {
  typebotId: string;
  // ... additional fields
}

/**
 * Typebot status change data
 */
export interface TypebotStatusData {
  typebotId: string;
  status: string;
}
