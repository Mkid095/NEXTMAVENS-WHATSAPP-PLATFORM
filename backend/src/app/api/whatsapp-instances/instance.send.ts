/**
 * Instance Message Send
 * Base path: /whatsapp/instances/:id/send
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { getEvolutionClient } from '../../../lib/evolution-api-client';
import { getSocketService } from '../../../lib/build-real-time-messaging-with-socket.io';
import { MessageType } from '@prisma/client';

const sendSchema = z.object({
  number: z.string().min(1),
  text: z.string().optional(),
  media: z.string().optional(),
  type: z.enum(['text', 'image', 'video', 'audio', 'document']).default('text'),
  quotedMessageId: z.string().optional(),
});

export default async function (fastify: FastifyInstance) {
  fastify.post('/:id/send', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = (request as any).currentOrgId as string;
      const userId = (request as any).currentUserId as string;
      const { id: instanceId } = request.params as { id: string };

      const body = sendSchema.parse(request.body);
      const to = body.number;
      const messageType = body.type;

      // Verify instance belongs to org
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id: instanceId, orgId },
      });
      if (!instance) {
        reply.code(404);
        return { success: false, error: 'WhatsApp instance not found' };
      }

      // Build content JSON
      const content: any = {};
      if (messageType === 'text') {
        content.text = body.text;
      } else {
        content.media = body.media;
        if (body.text) content.caption = body.text;
        content.type = messageType;
      }

      // Ensure chat exists
      const chat = await prisma.whatsAppChat.upsert({
        where: { orgId_chatId: { orgId, chatId: to } },
        update: { lastMessageAt: new Date() },
        create: {
          orgId,
          instanceId,
          chatId: to,
          phone: to,
          isGroup: false,
          lastMessageAt: new Date(),
        },
      });

      // Create message record
      const message = await prisma.whatsAppMessage.create({
        data: {
          orgId,
          instanceId,
          chatId: chat.id,
          messageId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          from: instance.phoneNumber,
          to,
          type: messageType as MessageType,
          content,
          status: 'PENDING',
          priority: 0,
          quotedData: body.quotedMessageId ? { messageId: body.quotedMessageId } : null,
          metadata: { source: 'api', userId },
        },
      });

      // Send via Evolution API
      try {
        const evo = getEvolutionClient();
        const evolutionInstanceName = instance.evolutionInstanceName;
        if (!evolutionInstanceName) {
          throw new Error('Instance not configured with Evolution');
        }

        let evolutionResponse: { messageId: string } = { messageId: '' };
        if (messageType === 'text') {
          evolutionResponse = await evo.sendText({
            instanceId: evolutionInstanceName,
            to,
            content: body.text || '',
            quotedMessageId: body.quotedMessageId,
          });
        } else {
          evolutionResponse = await evo.sendMedia({
            instanceId: evolutionInstanceName,
            to,
            mediaType: messageType,
            media: body.media!,
            caption: body.text,
          });
        }

        if (evolutionResponse?.messageId) {
          await prisma.whatsAppMessage.update({
            where: { id: message.id },
            data: { messageId: evolutionResponse.messageId, status: 'SENDING', sentAt: new Date() },
          });
          const socket = getSocketService();
          socket?.broadcastToOrg(orgId, 'message:sent', {
            messageId: message.id,
            evolutionMessageId: evolutionResponse.messageId,
            to,
            type: messageType,
            status: 'SENDING',
            sentAt: new Date(),
          });
        }

        return { success: true, data: { messageId: message.id, evolutionMessageId: evolutionResponse.messageId, status: 'SENDING', sentAt: message.sentAt } };
      } catch (evoError: any) {
        await prisma.whatsAppMessage.update({
          where: { id: message.id },
          data: { status: 'FAILED', failedAt: new Date(), failureReason: evoError.message },
        });
        reply.code(502);
        return { success: false, error: 'Failed to send via WhatsApp provider', details: evoError.message, messageId: message.id };
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({ success: false, error: 'Validation failed', details: error.format() });
      }
      reply.code(500).send({ success: false, error: 'Internal server error', details: error.message });
    }
  });
}
