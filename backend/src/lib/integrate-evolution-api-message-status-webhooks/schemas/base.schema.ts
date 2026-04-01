/**
 * Base Webhook Schema
 */

import { EvolutionEventType } from '../types';

/**
 * Root webhook payload schema
 */
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
