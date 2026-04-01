/**
 * Base Webhook Types
 *
 * Core structures for Evolution API webhook payloads.
 */

/**
 * Main webhook payload from Evolution API
 */
export interface EvolutionWebhookPayload {
  event: EvolutionEventType;
  instanceId: string;
  eventId?: string;
  data: EvolutionEventData;
  timestamp?: string;
}

/**
 * All possible event types
 */
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

/**
 * Union of all event data types
 */
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
  | Record<string, unknown>;
