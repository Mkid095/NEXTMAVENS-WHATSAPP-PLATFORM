/**
 * WhatsApp Templates API
 * Base path: /api/v1/whatsapp/templates
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

const createSchema = z.object({
  instanceId: z.string().min(1),
  name: z.string().min(1).max(255),
  category: z.enum(['MARKETING', 'TRANSACTIONAL', 'UTILITY']),
  language: z.string().min(2).max(10),
  components: z.any(),
  variables: z.array(z.string()).default([]),
});

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;

  // LIST
  fastify.get('/', async (request, reply) => {
    try {
      const instanceId = (request.query as any).instanceId as string;
      if (!instanceId) return reply.code(400).send({ success: false, error: 'instanceId required' });
      const templates = await prisma.whatsAppTemplate.findMany({
        where: { orgId: orgId(request), instanceId },
        orderBy: { createdAt: 'desc' },
      });
      return { success: true, data: { templates } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // CREATE
  fastify.post('/', async (request, reply) => {
    try {
      const body = createSchema.parse(request.body);
      const template = await prisma.whatsAppTemplate.create({
        data: {
          orgId: orgId(request),
          instanceId: body.instanceId,
          name: body.name,
          category: body.category,
          language: body.language,
          components: body.components,
          variables: body.variables,
          status: 'DRAFT',
        },
      });
      return { success: true, data: { template } };
    } catch (e: any) {
      if (e instanceof z.ZodError) return reply.code(400).send({ success: false, error: 'Validation error' });
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // UPDATE
  fastify.put('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const template = await prisma.whatsAppTemplate.update({
        where: { id, orgId: orgId(request) },
        data: { ...body, updatedAt: new Date() },
      });
      return { success: true, data: { template } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // DELETE
  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.whatsAppTemplate.delete({ where: { id, orgId: orgId(request) } });
      return { success: true, data: null };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // RENDER
  fastify.post('/:id/render', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { variables } = request.body as { variables: Record<string, string> };
      const template = await prisma.whatsAppTemplate.findUnique({ where: { id, orgId: orgId(request) } });
      if (!template) return reply.code(404).send({ success: false, error: 'Template not found' });
      const renderComponent = (comp: any) => {
        if (comp.type === 'BODY' && comp.text) {
          let text = comp.text;
          Object.entries(variables).forEach(([k, v]) => { text = text.replace(new RegExp(`{{${k}}}`, 'g'), v); });
          return { ...comp, text };
        }
        return comp;
      };
      return { success: true, data: { components: (template.components as any[]).map(renderComponent) } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
