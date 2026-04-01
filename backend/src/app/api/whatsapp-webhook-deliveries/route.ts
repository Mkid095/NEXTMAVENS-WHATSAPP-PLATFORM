/**
 * Webhook Deliveries API (top-level)
 * Base path: /api/v1/whatsapp/webhook
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../../lib/prisma';

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;

  // GET /webhook/deliveries?instanceId=&limit=
  fastify.get('/deliveries', async (request, reply) => {
    try {
      const instanceId = (request.query as any).instanceId as string;
      const limit = Math.min(parseInt((request.query as any).limit as string) || 50, 100);
      if (!instanceId) return reply.code(400).send({ success: false, error: 'instanceId required' });
      const logs = await prisma.webhookDeliveryLog.findMany({
        where: { subscription: { orgId: orgId(request), instanceId } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return { success: true, data: { logs } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
