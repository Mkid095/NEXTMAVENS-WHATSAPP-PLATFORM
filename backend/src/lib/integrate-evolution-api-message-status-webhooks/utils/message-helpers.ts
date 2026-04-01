/**
 * Message Helper Utilities
 * Helpers for processing message events
 */

import { prisma } from '../../prisma';

/**
 * Extract text from message content for lastMessage preview
 */
export function extractMessagePreview(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (content.body) return content.body;
  if (content.text) return content.text;
  if (content.caption) return content.caption;
  if (content.mediaUrl) {
    switch (content.type) {
      case 'image': return '📷 Image';
      case 'video': return '🎥 Video';
      case 'audio': return '🎵 Audio';
      case 'document': return `📎 ${content.fileName || 'File'}`;
      default: return `[${content.type}]`;
    }
  }
  return JSON.stringify(content);
}

/**
 * Ensure chat exists in database (idempotent)
 */
export async function ensureChatExists(
  orgId: string,
  instanceId: string,
  chatId: string,
  from: string | undefined,
  to: string | undefined
): Promise<void> {
  try {
    const phone = from?.endsWith('@c.us') ? from : to;
    if (!phone) {
      throw new Error('Cannot determine chat phone number');
    }

    await prisma.whatsAppChat.upsert({
      where: { id: chatId },
      update: {},
      create: {
        id: chatId,
        orgId,
        instanceId,
        chatId,
        phone,
      },
    });
  } catch (error: any) {
    if (error.code !== 'P2002') {
      throw error;
    }
  }
}

/**
 * Map Evolution presence status to human-readable format
 */
export function mapPresenceStatus(presence: string): string {
  const statusMap: Record<string, string> = {
    available: 'Online',
    unavailable: 'Offline',
    composing: 'Typing...',
    recording: 'Recording audio/video',
    typing: 'Typing...',
  };
  return statusMap[presence.toLowerCase()] ?? presence;
}
