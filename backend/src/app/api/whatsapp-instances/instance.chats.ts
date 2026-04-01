/**
 * WhatsApp Chat List Endpoint
 *
 * Fetches cached chat list for an instance with last message preview.
 * Data comes from local DB (populated by webhooks).
 * Real-time updates come via Socket.IO.
 *
 * Base path: /whatsapp/instances/:id/chats
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../../lib/prisma';

export default async function (fastify: FastifyInstance) {
  fastify.route({
    method: 'GET',
    url: '/:id/chats',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      // Helper to extract text from message content JSON
      const extractLastMessage = (content: any): string => {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (content.body) return content.body;
        if (content.text) return content.text;
        if (content.caption) return content.caption;
        // For media types
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
      };

      // Verify instance exists and belongs to org
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: { id: true },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      // Fetch chats with their last message content
      // Using raw SQL for efficient LEFT JOIN with latest message per chat
      const chats = await prisma.$queryRaw`
        SELECT
          c.id,
          c.chat_id,
          c.name,
          c.phone,
          c.avatar,
          c.last_message_at,
          c.unread_count,
          c."isGroup",
          c."isArchived",
          c."isPinned",
          m.content as last_message_content,
          m.type as last_message_type,
          m."from" as last_message_from
        FROM whatsapp_chats c
        LEFT JOIN (
          SELECT DISTINCT ON (chat_id)
            chat_id,
            content,
            type,
            "from",
            created_at
          FROM whatsapp_messages
          WHERE "orgId" = ${orgId}
            AND "instanceId" = ${id}
          ORDER BY chat_id, created_at DESC
        ) m ON m.chat_id = c.id
        WHERE c."orgId" = ${orgId}
          AND c."instanceId" = ${id}
        ORDER BY
          c."isPinned" DESC,
          c.last_message_at DESC NULLS LAST,
          c.created_at DESC
      `;

      // Transform to frontend format
      const transformedChats = (chats as any[]).map(chat => ({
        id: chat.id,
        name: chat.name || chat.phone || 'Unknown',
        isGroup: chat.isGroup,
        lastMessage: extractLastMessage(chat.last_message_content),
        lastMessageTime: chat.last_message_at ? Math.floor(new Date(chat.last_message_at).getTime() / 1000) : undefined,
        unreadCount: chat.unread_count,
        profilePicUrl: chat.avatar,
      }));

      return { success: true, data: { chats: transformedChats } };
    },
  });

  // POST /:id/chats/read - mark chat(s) as read
  fastify.post('/:id/chats/read', async (request, reply) => {
    try {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };
      // For now, reset unread count for all chats of this instance
      // (Simplified: actual implementation should use payload to target specific chats)
      await prisma.$executeRaw`
        UPDATE whatsapp_chats
        SET unread_count = 0, updated_at = NOW()
        WHERE "orgId" = ${orgId} AND "instanceId" = ${id}
      `;
      return { success: true, data: null };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
