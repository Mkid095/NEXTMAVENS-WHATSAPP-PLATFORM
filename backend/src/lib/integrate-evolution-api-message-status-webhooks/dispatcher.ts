/**
 * Webhook Event Dispatcher
 *
 * Routes webhook events to appropriate handlers.
 */

import type { ParsedWebhookEvent } from './types';
import * as handlers from './handlers';

/**
 * Dispatch webhook event to appropriate handler
 */
export async function dispatchWebhookHandler(
  event: ParsedWebhookEvent,
  orgId: string
): Promise<{
  success: boolean;
  result?: string;
  error?: string;
}> {
  try {
    switch (event.event) {
      case 'MESSAGES_UPSERT':
        return await handlers.handleMessageUpsert(event as any, orgId);

      case 'MESSAGES_UPDATE':
        return await handlers.handleMessageUpdate(event as any, orgId);

      case 'MESSAGES_DELETE':
        return await handlers.handleMessageDelete(event as any, orgId);

      case 'CONNECTION_UPDATE':
        return await handlers.handleConnectionUpdate(event, orgId);

      case 'QRCODE_UPDATED':
        return await handlers.handleQRCodeUpdate(event as any, orgId);

      case 'SEND_MESSAGE':
        return await handlers.handleSendMessage(event as any, orgId);

      case 'APPLICATION_STARTUP':
        return await handlers.handleApplicationStartup(event, orgId);

      default:
        console.log(`Unhandled webhook event: ${event.event}`, event);
        return {
          success: true,
          result: `Event ${event.event} acknowledged (no handler)`,
        };
    }
  } catch (error: any) {
    console.error(`Error processing webhook ${event.event}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}
