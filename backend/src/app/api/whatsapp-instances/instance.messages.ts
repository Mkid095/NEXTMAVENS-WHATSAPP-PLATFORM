/**
 * WhatsApp Message History Endpoint
 *
 * Fetches paginated message history for a specific chat.
 * Data comes from local DB (populated by webhooks).
 *
 * Base path: /whatsapp/instances/:id/chats/:chatId/messages
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../../lib/prisma';

export default async function (fastify: FastifyInstance) {
  fastify.route({
    method: 'GET',
    url: '/:id/chats/:chatId/messages',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id: instanceId, chatId } = request.params as { id: string; chatId: string };
      const { limit = 50, before } = request.query as { limit?: number; before?: string };

      // Verify instance exists and belongs to org, and get phone number for fromMe calculation
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id: instanceId, orgId },
        select: { id: true, phoneNumber: true },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      // Verify chat exists for this instance
      const chat = await prisma.whatsAppChat.findFirst({
        where: { id: chatId, instanceId, orgId },
        select: { id: true },
      });

      if (!chat) {
        reply.code(404);
        return { success: false, error: 'Chat not found' };
      }

      // Build query for messages
      const where: any = {
        instanceId,
        chatId,
        orgId,
      };

      // Pagination: fetch messages older than 'before' timestamp
      if (before) {
        const beforeDate = new Date(parseInt(before) * 1000);
        where.createdAt = { lt: beforeDate };
      }

      // Fetch messages ordered by createdAt desc (newest first, reverse for display)
      const messages = await prisma.whatsAppMessage.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit || 50,
        select: {
          id: true,
          messageId: true,
          from: true,
          to: true,
          type: true,
          content: true,
          createdAt: true,
        },
      });

      // Transform to frontend format
      const transformedMessages = messages.map(msg => {
        // Compute fromMe: if message sender is the instance's phone number, it's fromMe
        const fromMe = msg.from === instance?.phoneNumber;

        // Decode content JSON - cast to any to avoid type errors with Prisma Json
        const content = msg.content as any;
        let body = '';
        let mediaUrl;
        if (content) {
          if (typeof content === 'string') {
            body = content;
          } else if (content.body) {
            body = content.body;
          } else if (content.text) {
            body = content.text;
          } else if (content.caption) {
            body = content.caption;
          }
          if (content.mediaUrl) {
            mediaUrl = content.mediaUrl;
          }
        }

        return {
          id: msg.id,
          from: msg.from,
          to: msg.to,
          body: body,
          type: msg.type,
          timestamp: Math.floor(msg.createdAt.getTime() / 1000),
          fromMe,
          mediaUrl: mediaUrl,
        };
      }).reverse(); // Reverse to chronological order (oldest first)

      return { success: true, data: { messages: transformedMessages } };
    },
  });
}
