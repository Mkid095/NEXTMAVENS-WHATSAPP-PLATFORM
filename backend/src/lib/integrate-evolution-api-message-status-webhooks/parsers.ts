/**
 * Webhook Event Parsers
 *
 * Main entry point for parsing Evolution API webhook payloads.
 */

import type { EvolutionWebhookPayload, ParsedWebhookEvent } from './types';
import {
  EvolutionEventData,
  MessageUpsertData,
  MessageUpdateData,
  MessageDeleteData,
  ConnectionUpdateData,
  QRCodeUpdateData,
} from './types';
import * as helpers from './parsers.helpers';

/**
 * Parse a webhook payload into structured event data
 */
export function parseWebhookPayload(
  payload: EvolutionWebhookPayload
): ParsedWebhookEvent {
  const { event, instanceId, data, timestamp } = payload;
  const timestampMs = timestamp ? parseInt(timestamp, 10) : undefined;

  switch (event) {
    case 'MESSAGES_UPSERT':
      return helpers.parseMessageUpsert(instanceId, data as MessageUpsertData, timestampMs);

    case 'MESSAGES_UPDATE':
      return helpers.parseMessageUpdate(instanceId, data as MessageUpdateData, timestampMs);

    case 'MESSAGES_DELETE':
      return helpers.parseMessageDelete(instanceId, data as MessageDeleteData, timestampMs);

    case 'CONNECTION_UPDATE':
      return helpers.parseConnectionUpdate(instanceId, data as ConnectionUpdateData, timestampMs);

    case 'QRCODE_UPDATED':
      return helpers.parseQRCodeUpdate(instanceId, data as QRCodeUpdateData, timestampMs);

    case 'SEND_MESSAGE':
      return helpers.parseSendMessage(instanceId, data, timestampMs);

    case 'APPLICATION_STARTUP':
      return {
        event: 'APPLICATION_STARTUP',
        instanceId,
        timestamp: timestampMs,
        data: data as any,
      };

    default:
      // Return generic parsed event for unknown types
      return {
        event,
        instanceId,
        timestamp: timestampMs,
        data: data as EvolutionEventData,
      };
  }
}
