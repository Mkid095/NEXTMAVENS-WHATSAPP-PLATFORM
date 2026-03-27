/**
 * Messages Send API Routes
 *
 * Endpoints for sending WhatsApp messages via Evolution API.
 * Protected by global auth + orgGuard + rateLimit + quota + throttle + idempotency middleware.
 *
 * Base path: /api/v1/messages
 * Endpoints:
 * - POST /send - Send a message (text, media, buttons, location, template)
 *
 * @example POST /api/v1/messages/send
 * Body: { instanceId, to, type: "text", content: "Hello" }
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { getEvolutionClient } from '../../../../lib/evolution-api-client';
import { getSocketService } from '../../../../lib/build-real-time-messaging-with-socket.io';
import { sendMessageSchema } from './schema';
import { MessageType } from '@prisma/client';

type SendMessage = z.infer<typeof sendMessageSchema>;

export async function registerMessagesRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/send',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        console.log('[MESSAGE HANDLER] Called!');
        console.log('[MESSAGE HANDLER] request.user:', (request as any).user);
        console.log('[MESSAGE HANDLER] currentOrgId:', (request as any).currentOrgId);
        console.log('[MESSAGE HANDLER] currentUserId:', (request as any).currentUserId);
        // Validate request body
        const validated = sendMessageSchema.parse(request.body) as SendMessage;
        const orgId = (request as any).currentOrgId;
        const userId = (request as any).currentUserId;

        if (!orgId) {
          reply.code(400);
          return { success: false, error: 'Organization context required' };
        }

        // Verify instance belongs to org
        const instance = await prisma.whatsAppInstance.findFirst({
          where: { id: validated.instanceId, orgId },
        });

        if (!instance) {
          reply.code(404);
          return { success: false, error: 'WhatsApp instance not found' };
        }

        // Build content JSON based on message type
        const content: any = {};

        switch (validated.type) {
          case 'text':
            content.text = validated.content;
            break;

          case 'image':
          case 'video':
          case 'audio':
          case 'document':
            content.media = validated.media;
            if (validated.caption) content.caption = validated.caption;
            if (validated.fileName) content.fileName = validated.fileName;
            if (validated.mimetype) content.mimetype = validated.mimetype;
            break;

          case 'buttons':
            content.title = validated.title;
            if (validated.description) content.description = validated.description;
            if (validated.footer) content.footer = validated.footer;
            content.buttons = validated.buttons;
            break;

          case 'location':
            content.location = {
              latitude: validated.latitude,
              longitude: validated.longitude,
              name: validated.name,
              address: validated.address,
            };
            break;

          case 'template':
            content.template = {
              name: validated.templateName,
              language: validated.language,
              components: validated.components,
            };
            break;
        }

        // Ensure chat exists (create if not exists)
        // We need the WhatsAppChat record's ID (primary key) for the foreign key.
        // Use phone number (validated.to) as chatId (unique per org via @@unique), then retrieve its ID.
        const chat = await prisma.whatsAppChat.upsert({
          where: {
            orgId_chatId: {
              orgId,
              chatId: validated.to,
            },
          },
          update: {
            lastMessageAt: new Date(),
          },
          create: {
            orgId,
            instanceId: validated.instanceId,
            chatId: validated.to,
            phone: validated.to,
            isGroup: false,
            lastMessageAt: new Date(),
          },
        });
        console.log('[Chat] Upserted chat:', chat.id, 'chatId:', chat.chatId);

        // Create message record in DB
        const message = await prisma.whatsAppMessage.create({
          data: {
            orgId,
            instanceId: validated.instanceId,
            chatId: chat.id, // Use the chat's primary key
            messageId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            from: instance.phoneNumber,
            to: validated.to,
            type: validated.type as MessageType,
            content,
            status: 'PENDING',
            priority: 0,
            quotedData: validated.quotedMessageId ? { messageId: validated.quotedMessageId } : null,
            metadata: {
              source: 'api',
              userId,
              userAgent: request.headers['user-agent'],
            },
          },
        });

        // Send via Evolution API
        try {
          const evo = getEvolutionClient();
          let evolutionResponse: { messageId: string } = { messageId: '' };

          // Use Evolution instance name, not internal DB ID
          const evolutionInstanceName = instance.evolutionInstanceName;
          if (!evolutionInstanceName) {
            throw new Error('WhatsApp instance is not configured with an Evolution instance name');
          }

          switch (validated.type) {
            case 'text':
              evolutionResponse = await evo.sendText({
                instanceId: evolutionInstanceName,
                to: validated.to,
                content: validated.content,
                quotedMessageId: validated.quotedMessageId,
                mentions: validated.mentions,
              });
              break;

            case 'image':
            case 'video':
            case 'audio':
            case 'document':
              evolutionResponse = await evo.sendMedia({
                instanceId: evolutionInstanceName,
                to: validated.to,
                mediaType: validated.type,
                media: validated.media,
                caption: validated.caption,
                fileName: validated.fileName,
                mimetype: validated.mimetype,
                quotedMessageId: validated.quotedMessageId,
              });
              break;

            case 'buttons':
              evolutionResponse = await evo.sendButtons({
                instanceId: evolutionInstanceName,
                to: validated.to,
                title: validated.title,
                description: validated.description,
                footer: validated.footer,
                buttons: validated.buttons,
                quotedMessageId: validated.quotedMessageId,
              });
              break;

            case 'location':
              evolutionResponse = await evo.sendLocation({
                instanceId: evolutionInstanceName,
                to: validated.to,
                latitude: validated.latitude,
                longitude: validated.longitude,
                name: validated.name,
                address: validated.address,
                quotedMessageId: validated.quotedMessageId,
              });
              break;

            case 'template':
              evolutionResponse = await evo.sendTemplate({
                instanceId: evolutionInstanceName,
                to: validated.to,
                templateName: validated.templateName,
                language: validated.language,
                components: validated.components,
              });
              break;
          }

          // Update message with Evolution's message ID
          if (evolutionResponse?.messageId) {
            await prisma.whatsAppMessage.update({
              where: { id: message.id },
              data: {
                messageId: evolutionResponse.messageId,
                status: 'SENDING',
                sentAt: new Date(),
              },
            });

            // Emit real-time update via Socket.io
            const socketService = getSocketService();
            if (socketService) {
              socketService.broadcastToOrg(orgId, 'message:sent', {
                messageId: message.id,
                evolutionMessageId: evolutionResponse.messageId,
                to: validated.to,
                type: validated.type,
                status: 'SENDING',
                sentAt: new Date(),
              });
            }
          }

          return {
            success: true,
            data: {
              messageId: message.id,
              evolutionMessageId: evolutionResponse?.messageId,
              status: 'SENDING',
              sentAt: message.sentAt,
            },
          };
        } catch (evoError: any) {
          // Mark message as FAILED
          await prisma.whatsAppMessage.update({
            where: { id: message.id },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              failureReason: evoError.message,
            },
          });

          console.error('[MessageSend] Evolution API error:', evoError);

          reply.code(502);
          return {
            success: false,
            error: 'Failed to send message via WhatsApp provider',
            details: evoError.message,
            messageId: message.id,
          };
        }
      } catch (error: any) {
        console.error('[MessageSend] Error:', error);

        if (error instanceof z.ZodError) {
          reply.code(400);
          return {
            success: false,
            error: 'Validation failed',
            details: error.format(),
          };
        }

        reply.code(500);
        return {
          success: false,
          error: 'Internal server error',
          details: error.message,
        };
      }
    }
  );

  console.log('[Messages] POST /api/v1/messages/send - registered');
}
