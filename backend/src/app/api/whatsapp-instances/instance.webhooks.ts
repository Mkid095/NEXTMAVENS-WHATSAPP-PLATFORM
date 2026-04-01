/**
 * Instance Webhooks API (sub-routes under /instances/:instanceId/webhooks)
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../../lib/prisma';

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;

  // LIST: GET /instances/:id/webhooks
  fastify.get('/webhooks', async (request, reply) => {
    try {
      const { instanceId } = request.params as { instanceId: string };
      const subscriptions = await prisma.webhookSubscription.findMany({
        where: { orgId: orgId(request), instanceId },
        orderBy: { createdAt: 'desc' },
      });
      return { success: true, data: { subscriptions } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // CREATE or UPDATE: POST /instances/:id/webhooks
  fastify.post('/webhooks', async (request, reply) => {
    try {
      const { instanceId } = request.params as { instanceId: string };
      const { eventType, url, secret } = request.body as { eventType: string; url: string; secret?: string };
      // Check if exists
      const existing = await prisma.webhookSubscription.findFirst({
        where: { orgId: orgId(request), instanceId, eventType },
      });
      let subscription;
      if (existing) {
        subscription = await prisma.webhookSubscription.update({
          where: { id: existing.id },
          data: { url, secret: secret || undefined, isActive: true, updatedAt: new Date() },
        });
      } else {
        subscription = await prisma.webhookSubscription.create({
          data: { orgId: orgId(request), instanceId, eventType, url, secret: secret || undefined, isActive: true },
        });
      }
      return { success: true, data: { subscription } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // GET delivery logs: GET /instances/:id/webhook-deliveries
  fastify.get('/webhook-deliveries', async (request, reply) => {
    try {
      const { instanceId } = request.params as { instanceId: string };
      const { limit = 50 } = request.query as any;
      const logs = await prisma.webhookDeliveryLog.findMany({
        where: { subscription: { orgId: orgId(request), instanceId } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
      });
      return { success: true, data: { logs } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
