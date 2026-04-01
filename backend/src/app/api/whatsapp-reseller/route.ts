/**
 * Reseller/Sub-Instance Management API
 * Base path: /api/v1/whatsapp/reseller
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

const createSchema = z.object({
  parentInstanceId: z.string().min(1),
  name: z.string().min(1).max(255),
  clientName: z.string().optional(),
  clientEmail: z.string().email().optional(),
  webhookUrl: z.string().url().optional(),
  quotaLimit: z.number().int().positive().optional(),
  quotaPeriod: z.enum(['hourly', 'daily', 'monthly']).default('monthly'),
});

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;

  // GET /token
  fastify.get('/token', async (request, reply) => {
    try {
      const user = (request as any).user;
      if (!user) return reply.code(401).send({ success: false, error: 'Auth required' });
      const token = user.resellerToken || crypto.randomUUID();
      return { success: true, data: { token, expiresIn: 3600 } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // GET /sub-instances?parentId=
  fastify.get('/sub-instances', async (request, reply) => {
    try {
      const parentId = (request.query as any).parentId as string;
      if (!parentId) return reply.code(400).send({ success: false, error: 'parentId required' });
      const subs = await prisma.whatsAppInstance.findMany({
        where: { orgId: orgId(request), parentInstanceId: parentId },
        select: { id: true, name: true, phoneNumber: true, status: true, createdAt: true, updatedAt: true },
      });
      return { success: true, data: { subInstances: subs } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // POST /create-sub-instance
  fastify.post('/create-sub-instance', async (request, reply) => {
    try {
      const body = createSchema.parse(request.body);
      const org = await prisma.organization.findUnique({ where: { id: orgId(request) } });
      if (!org) return reply.code(404).send({ success: false, error: 'Org not found' });
      const sub = await prisma.whatsAppInstance.create({
        data: { orgId: orgId(request), parentInstanceId: body.parentInstanceId, name: body.name, phoneNumber: null, status: 'DISCONNECTED' },
      });
      if (body.quotaLimit && body.quotaPeriod) {
        await prisma.quotaUsage.create({
          data: { orgId: orgId(request), metric: 'api_calls', value: BigInt(body.quotaLimit), period: body.quotaPeriod, periodStart: new Date() },
        });
      }
      return { success: true, data: { subInstance: sub } };
    } catch (e: any) {
      if (e instanceof z.ZodError) return reply.code(400).send({ success: false, error: 'Validation error' });
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // GET /sub-instances/:id/status
  fastify.get('/sub-instances/:id/status', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const sub = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId: orgId(request) },
        select: { id: true, name: true, status: true, lastSeen: true, updatedAt: true },
      });
      if (!sub) return reply.code(404).send({ success: false, error: 'Not found' });
      return { success: true, data: { subInstance: sub } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // DELETE /sub-instances/:id
  fastify.delete('/sub-instances/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.whatsAppInstance.delete({ where: { id, orgId: orgId(request) } });
      return { success: true, data: null };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // POST /sub-instances/:id/connect
  fastify.post('/sub-instances/:id/connect', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      // Update status to CONNECTING
      const instance = await prisma.whatsAppInstance.update({
        where: { id, orgId: orgId(request) },
        data: { status: 'CONNECTING' },
      });
      // TODO: Initiate QR generation via Evolution client
      return { success: true, data: { instance } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
