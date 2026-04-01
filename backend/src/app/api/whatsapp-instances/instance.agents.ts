/**
 * Instance Agents API (sub-routes under /instances/:instanceId/agents)
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;

  // LIST agents for instance: GET /instances/:id/agents
  fastify.get('/agents', async (request, reply) => {
    try {
      const { instanceId } = request.params as { instanceId: string };
      const agents = await prisma.whatsAppAgent.findMany({
        where: { orgId: orgId(request), instanceId },
        include: { user: { select: { name: true, email: true } } },
      });
      return { success: true, data: { agents } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // CREATE agent assignment: POST /instances/:id/agents
  fastify.post('/agents', async (request, reply) => {
    try {
      const { instanceId } = request.params as { instanceId: string };
      const { userId } = request.body as { userId: string };
      const agent = await prisma.whatsAppAgent.create({
        data: { orgId: orgId(request), instanceId, userId, isActive: true, maxChats: 50 },
      });
      return { success: true, data: { agent } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // GET queue stats for instance: GET /instances/:id/queue
  fastify.get('/queue', async (request, reply) => {
    try {
      const { instanceId } = request.params as { instanceId: string };
      const stats = await prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE a."isActive" = true) as active_agents,
          COUNT(*) FILTER (WHERE a."isActive" = false) as inactive_agents,
          COUNT(c.id) as total_assigned_chats
        FROM whatsapp_agents a
        LEFT JOIN whatsapp_assignments c ON c."agentId" = a.id AND c."orgId" = ${orgId(request)}
        WHERE a."orgId" = ${orgId(request)} AND a."instanceId" = ${instanceId}
      `;
      return { success: true, data: { stats: stats[0] } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
