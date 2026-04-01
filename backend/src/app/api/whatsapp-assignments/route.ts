/**
 * WhatsApp Chat Assignments
 * Base path: /api/v1/whatsapp/assignments
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;

  // GET /assignments/:instanceId
  fastify.get('/:instanceId', async (request, reply) => {
    try {
      const { instanceId } = request.params as { instanceId: string };
      const assignments = await prisma.whatsAppAssignment.findMany({
        where: { orgId: orgId(request), instanceId },
        include: {
          agent: { include: { user: { select: { name: true, email: true } } } },
          chat: true,
        },
        orderBy: { assignedAt: 'desc' },
      });
      return { success: true, data: { assignments } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // POST /assignments - assign chat to agent
  fastify.post('/', async (request, reply) => {
    try {
      const { chatJid, agentId } = request.body as { chatJid: string; agentId: string };
      // Verify chat and agent belong to same org and instance
      const chat = await prisma.whatsAppChat.findFirst({
        where: { chatId: chatJid, orgId: orgId(request) },
      });
      const agent = await prisma.whatsAppAgent.findFirst({
        where: { id: agentId, orgId: orgId(request) },
      });
      if (!chat || !agent) {
        return reply.code(404).send({ success: false, error: 'Chat or agent not found' });
      }
      const assignment = await prisma.whatsAppAssignment.create({
        data: { orgId: orgId(request), instanceId: chat.instanceId, chatId: chat.id, agentId },
      });
      return { success: true, data: { assignment } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
