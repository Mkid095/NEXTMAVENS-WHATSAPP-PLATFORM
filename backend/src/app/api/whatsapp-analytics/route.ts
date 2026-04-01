/**
 * WhatsApp Analytics API
 * Base path: /api/v1/whatsapp/analytics
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

const periodSchema = z.object({
  instanceId: z.string().min(1),
  period: z.enum(['day', 'week', 'month']).default('week'),
});

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;
  const getDateRange = (p: string) => {
    const now = new Date();
    const start = new Date();
    if (p === 'day') start.setHours(0, 0, 0, 0);
    else if (p === 'week') start.setDate(now.getDate() - 7);
    else start.setMonth(now.getMonth() - 1);
    return { start, end: now };
  };

  // CONVERSATIONS
  fastify.get('/conversations', async (request, reply) => {
    try {
      const q = periodSchema.parse(request.query);
      const { start, end } = getDateRange(q.period);
      const total = await prisma.whatsAppChat.count({
        where: { orgId: orgId(request), instanceId: q.instanceId, createdAt: { gte: start, lte: end } },
      });
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const active = await prisma.whatsAppChat.count({
        where: { orgId: orgId(request), instanceId: q.instanceId, lastMessageAt: { gte: yesterday } },
      });
      return { success: true, data: { totalConversations: total, activeConversations: active, avgResponseTime: 0, period: q.period } };
    } catch (e: any) {
      if (e instanceof z.ZodError) return reply.code(400).send({ success: false, error: 'Validation error' });
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // MESSAGES
  fastify.get('/messages', async (request, reply) => {
    try {
      const q = periodSchema.parse(request.query);
      const { start } = getDateRange(q.period);
      const result = await prisma.$queryRaw<[{ sent: bigint; delivered: bigint; read: bigint; failed: bigint }]>`
        SELECT COUNT(*) FILTER (WHERE status = 'SENT') as sent,
               COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
               COUNT(*) FILTER (WHERE status = 'READ') as read,
               COUNT(*) FILTER (WHERE status = 'FAILED') as failed
        FROM whatsapp_messages
        WHERE org_id = ${orgId(request)} AND instance_id = ${q.instanceId} AND created_at >= ${start}
      `;
      const r = result[0] || { sent: 0n, delivered: 0n, read: 0n, failed: 0n };
      return { success: true, data: { sent: Number(r.sent), delivered: Number(r.delivered), read: Number(r.read), failed: Number(r.failed), period: q.period } };
    } catch (e: any) {
      if (e instanceof z.ZodError) return reply.code(400).send({ success: false, error: 'Validation error' });
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // AGENTS
  fastify.get('/agents', async (request, reply) => {
    try {
      const q = periodSchema.parse(request.query);
      const { start } = getDateRange(q.period);
      const agents = await prisma.whatsAppAgent.findMany({
        where: { orgId: orgId(request), isActive: true },
        include: { user: { select: { name: true, email: true } }, assignments: { where: { assignedAt: { gte: start } } } },
      });
      return { success: true, data: { agents: agents.map(a => ({ id: a.id, name: a.user.name || a.user.email, email: a.user.email, assignmentsCount: a.assignments.length })), period: q.period } };
    } catch (e: any) {
      if (e instanceof z.ZodError) return reply.code(400).send({ success: false, error: 'Validation error' });
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // SLA
  fastify.get('/sla', async (request, reply) => {
    try {
      const q = periodSchema.parse(request.query);
      const { start } = getDateRange(q.period);
      const result = await prisma.$queryRaw<[{ avgMinutes: number }]>`
        SELECT AVG(EXTRACT(EPOCH FROM (read_at - sent_at)) / 60) as "avgMinutes"
        FROM whatsapp_messages
        WHERE org_id = ${orgId(request)} AND instance_id = ${q.instanceId} AND sent_at >= ${start} AND read_at IS NOT NULL
      `;
      const avg = result[0]?.avgMinutes || 0;
      return { success: true, data: { averageResponseTimeMinutes: Math.round(avg * 10) / 10, slaCompliance: 95, period: q.period } };
    } catch (e: any) {
      if (e instanceof z.ZodError) return reply.code(400).send({ success: false, error: 'Validation error' });
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
