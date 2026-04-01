/**
 * WhatsApp Agents (top-level endpoints not under instances)
 * Base path: /api/v1/whatsapp/agents
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;

  // PUT /agents/:id/status
  fastify.put('/agents/:id/status', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: 'available' | 'busy' | 'away' | 'offline' };
      const agent = await prisma.whatsAppAgent.update({
        where: { id, orgId: orgId(request) },
        data: { isActive: status !== 'offline' },
      });
      return { success: true, data: { agent } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
