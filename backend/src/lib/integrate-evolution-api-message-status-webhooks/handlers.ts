/**
 * Webhook Event Handlers
 *
 * Business logic for processing each Evolution API webhook event
 */

import { prisma } from '../prisma';
import { ParsedWebhookEvent } from './parsers';
import { getSocketService } from '../build-real-time-messaging-with-socket.io';

// Helper: Broadcast event to instance room (if socket service is available)
async function broadcastToInstance(instanceId: string, event: string, data: any): Promise<void> {
  const socketService = getSocketService();
  if (socketService) {
    socketService.broadcastToInstance(instanceId, event, data);
  }
}

// Helper: Broadcast event to org room (if socket service is available)
async function broadcastToOrg(orgId: string, event: string, data: any): Promise<void> {
  const socketService = getSocketService();
  if (socketService) {
    socketService.broadcastToOrg(orgId, event, data);
  }
}

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
        return await handleMessageUpsert(event, orgId);

      case 'MESSAGES_UPDATE':
        return await handleMessageUpdate(event, orgId);

      case 'MESSAGES_DELETE':
        return await handleMessageDelete(event, orgId);

      case 'CONNECTION_UPDATE':
        return await handleConnectionUpdate(event, orgId);

      case 'QRCODE_UPDATED':
        return await handleQRCodeUpdate(event, orgId);

      case 'SEND_MESSAGE':
        return await handleSendMessage(event, orgId);

      case 'APPLICATION_STARTUP':
        return await handleApplicationStartup(event, orgId);

      default:
        // For unhandled events, just log them
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

// ============================================================================
// Message Event Handlers
// ============================================================================

/**
 * Handle MESSAGES_UPSERT - New incoming or outgoing message
 *
 * Creates the message in database. For incoming messages, also creates
/chat if doesn't exist. For outgoing, should already have chat.
 */
async function handleMessageUpsert(
  event: ParsedWebhookEvent,
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { messageId, chatId, from, to, type, content, status } = event;

  if (!messageId || !chatId || !type) {
    return {
      success: false,
      error: 'Missing required fields: messageId, chatId, type',
    };
  }

  // Ensure chat exists first (if not, create it)
  await ensureChatExists(orgId, event.instanceId, chatId, from, to);

  let message;
  try {
    // Try to insert new message (idempotent: fails if exists, then we update)
    message = await prisma.whatsAppMessage.create({
      data: {
        id: messageId,
        orgId,
        instanceId: event.instanceId,
        chatId,
        messageId, // External WhatsApp message ID
        from: from ?? 'unknown',
        to: to ?? '',
        type: type as any, // Cast to MessageType enum
        content: (content ?? null) as any,
        status: (status ?? 'PENDING') as any,
        sentAt: content?.messageTimestamp
          ? new Date(content.messageTimestamp as string)
          : null,
      },
    });

    // Broadcast to connected clients
    await broadcastToInstance(event.instanceId, 'whatsapp:message:upsert', {
      id: message.id,
      chatId: message.chatId,
      messageId: message.messageId,
      from: message.from,
      to: message.to,
      type: message.type,
      content: message.content,
      status: message.status,
      timestamp: message.sentAt?.getTime() || Date.now(),
    });

    return { success: true, result: `Message ${messageId} created` };
  } catch (error: any) {
    // If duplicate key (message already exists), update instead
    if (error.code === 'P2002') {
      // Fetch existing message to get current data for broadcast
      const existing = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
      if (!existing) {
        throw new Error(`Message ${messageId} claimed duplicate but not found`);
      }

      // Update message
      message = await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: status as any,
          content: (content ?? undefined) as any,
          sentAt: content?.messageTimestamp
            ? new Date(content.messageTimestamp as string)
            : undefined,
        },
      });

      // Broadcast update (same event type for upsert)
      await broadcastToInstance(event.instanceId, 'whatsapp:message:upsert', {
        id: message.id,
        chatId: message.chatId,
        messageId: message.messageId,
        from: message.from,
        to: message.to,
        type: message.type,
        content: message.content,
        status: message.status,
        timestamp: message.sentAt?.getTime() || Date.now(),
      });

      return { success: true, result: `Message ${messageId} updated` };
    }

    throw error;
  }
}

/**
 * Handle MESSAGES_UPDATE - Status change (delivered, read, etc.)
 */
async function handleMessageUpdate(
  event: ParsedWebhookEvent,
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { messageId, status } = event;

  if (!messageId || !status) {
    return {
      success: false,
      error: 'Missing required fields: messageId, status',
    };
  }

  try {
    const updated = await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: { status: status as any },
    });

    // Broadcast status update
    await broadcastToInstance(event.instanceId, 'whatsapp:message:update', {
      id: updated.id,
      chatId: updated.chatId,
      status: updated.status,
      timestamp: Date.now(),
    });

    return { success: true, result: `Message ${updated.id} status updated to ${status}` };
  } catch (error: any) {
    if (error.code === 'P2025') {
      // Record not found - maybe message was deleted or never synced
      console.warn(`Message ${messageId} not found for status update`);
      return {
        success: true,
        result: `Message ${messageId} not found (ignored)`,
      };
    }
    throw error;
  }
}

/**
 * Handle MESSAGES_DELETE - Message was deleted
 */
async function handleMessageDelete(
  event: ParsedWebhookEvent,
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { messageId } = event;

  if (!messageId) {
    return { success: false, error: 'Missing messageId' };
  }

  try {
    // Fetch message before delete to get instanceId for broadcast
    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });

    await prisma.whatsAppMessage.delete({
      where: { id: messageId },
    });

    // Broadcast deletion if we know which instance
    if (message) {
      await broadcastToInstance(message.instanceId, 'whatsapp:message:delete', {
        id: messageId,
        chatId: message.chatId,
      });
    }

    return { success: true, result: `Message ${messageId} deleted` };
  } catch (error: any) {
    if (error.code === 'P2025') {
      // Already deleted
      return { success: true, result: `Message ${messageId} already deleted` };
    }
    throw error;
  }
}

// ============================================================================
// Instance & Connection Handlers
// ============================================================================

/**
 * Handle CONNECTION_UPDATE - Instance connection status changed
 */
async function handleConnectionUpdate(
  event: ParsedWebhookEvent,
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { message } = event;
  // Parse status from message or data
  const statusMatch = message?.match(/status changed to: (\w+)/);
  const newStatus = statusMatch?.[1] ?? 'UNKNOWN';

  // Map to our InstanceStatus enum
  const statusMap: Record<string, string> = {
    connected: 'CONNECTED',
    connecting: 'CONNECTING',
    disconnected: 'DISCONNECTED',
    error: 'ERROR',
  };
  const prismaStatus = statusMap[newStatus.toLowerCase()] ?? 'DISCONNECTED';

  await prisma.whatsAppInstance.update({
    where: { id: event.instanceId },
    data: { status: prismaStatus as any, lastSeen: new Date() },
  });

  // Broadcast status change to org room (all agents should see instance status)
  await broadcastToOrg(orgId, 'whatsapp:instance:status', {
    instanceId: event.instanceId,
    status: prismaStatus,
    timestamp: Date.now(),
  });

  return {
    success: true,
    result: `Instance ${event.instanceId} status set to ${prismaStatus}`,
  };
}

/**
 * Handle QRCODE_UPDATED - QR code refreshed (for reconnection)
 */
async function handleQRCodeUpdate(
  event: ParsedWebhookEvent,
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { instanceId } = event;
  // QR code updates typically require no action on our side
  // Just log for audit purposes (webhook delivery log will capture)
  console.log(`QR code updated for instance ${instanceId}`);
  return { success: true, result: `QR code update acknowledged` };
}

/**
 * Handle APPLICATION_STARTUP - Evolution API instance started
 */
async function handleApplicationStartup(
  event: ParsedWebhookEvent,
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { instanceId } = event;
  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: { lastSeen: new Date() },
  });
  return { success: true, result: `Startup event processed` };
}

/**
 * Handle SEND_MESSAGE - Confirmation that a message was sent
 */
async function handleSendMessage(
  event: ParsedWebhookEvent,
  orgId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  const { messageId, status } = event;

  try {
    const updated = await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: { status: status === 'success' ? 'SENT' : 'FAILED' },
    });

    // Broadcast status change (likely to SENT or FAILED)
    await broadcastToInstance(updated.instanceId, 'whatsapp:message:update', {
      id: updated.id,
      chatId: updated.chatId,
      status: updated.status,
      timestamp: Date.now(),
    });

    return { success: true, result: `Send confirmation processed` };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: true, result: `Message not found (ignored)` };
    }
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Ensure a WhatsApp chat exists for the given identifiers
 *
 * Evolution API may not explicitly create chats - they are inferred from
 * message interactions. So we need to upsert chats on first message.
 */
async function ensureChatExists(
  orgId: string,
  instanceId: string,
  chatId: string,
  from: string | undefined,
  to: string | undefined
): Promise<void> {
  try {
    // Try to create chat (idempotent)
    const phone = from?.endsWith('@c.us') ? from : to;
    if (!phone) {
      throw new Error('Cannot determine chat phone number');
    }

    await prisma.whatsAppChat.upsert({
      where: {
        id: chatId,
      },
      update: {}, // No updates needed
      create: {
        id: chatId,
        orgId,
        instanceId,
        chatId,
        phone,
        // name will be populated later from contacts if available
      },
    });
  } catch (error: any) {
    // Ignore duplicate errors (chat already exists)
    if (error.code !== 'P2002') {
      throw error;
    }
  }
}

/**
 * Map Evolution presence status to human-readable format
 */
function mapPresenceStatus(presence: string): string {
  const statusMap: Record<string, string> = {
    available: 'Online',
    unavailable: 'Offline',
    composing: 'Typing...',
    recording: 'Recording audio/video',
    typing: 'Typing...',
  };
  return statusMap[presence.toLowerCase()] ?? presence;
}
