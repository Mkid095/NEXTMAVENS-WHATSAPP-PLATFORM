/**
 * WhatsApp Groups API
 * Base path: /api/v1/whatsapp/groups
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

const createGroupSchema = z.object({
  instanceId: z.string().min(1),
  name: z.string().min(1).max(255),
  participants: z.array(z.string()).default([]),
});

const updateGroupSchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
  isAnnounceGroup: z.boolean().optional(),
});

export default async function (fastify: FastifyInstance) {
  const orgId = (r: any) => r.currentOrgId as string;

  // LIST
  fastify.get('/', async (request, reply) => {
    try {
      const instanceId = (request.query as any).instanceId as string;
      if (!instanceId) return reply.code(400).send({ success: false, error: 'instanceId required' });

      const groups = await prisma.$queryRaw`
        SELECT g.id, g.jid, g.subject as name, g."subjectTime", g.description,
               g."ownerJid", g."participantsCount", g.creation, g."createdAt" as "createdAt"
        FROM whatsapp_groups g
        WHERE g."orgId" = ${orgId(request)} AND g."instanceId" = ${instanceId}
        ORDER BY g."createdAt" DESC
      `;
      return { success: true, data: { groups } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // CREATE
  fastify.post('/', async (request, reply) => {
    try {
      const body = createGroupSchema.parse(request.body);
      const group = await prisma.$executeRaw`
        INSERT INTO whatsapp_groups (id, "orgId", "instanceId", jid, subject, "subjectTime", description, "ownerJid", "participantsCount", creation, "createdAt", "updatedAt")
        VALUES (${`temp-${Date.now()}`}, ${orgId(request)}, ${body.instanceId}, ${`${body.name}@g.us`}, ${body.name}, ${Date.now()}, ${''}, ${''}, ${body.participants.length}, ${Date.now()}, NOW(), NOW())
        RETURNING *
      `;
      return { success: true, data: { group } };
    } catch (e: any) {
      if (e instanceof z.ZodError) return reply.code(400).send({ success: false, error: 'Validation error' });
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // DETAIL
  fastify.get('/:jid', async (request, reply) => {
    try {
      const { jid } = request.params as { jid: string };
      const groups = await prisma.$queryRaw`SELECT * FROM whatsapp_groups WHERE "orgId" = ${orgId(request)} AND jid = ${jid}`;
      const group = (Array.isArray(groups) && groups[0]) || null;
      if (!group) return reply.code(404).send({ success: false, error: 'Group not found' });
      return { success: true, data: { group } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // UPDATE
  fastify.put('/:jid', async (request, reply) => {
    try {
      const { jid } = request.params as { jid: string };
      const body = updateGroupSchema.parse(request.body);
      // Verify group exists and belongs to org
      const existing = await prisma.$queryRaw`SELECT id FROM whatsapp_groups WHERE "orgId" = ${orgId(request)} AND jid = ${jid}`;
      if (!existing || !Array.isArray(existing) || existing.length === 0) {
        return reply.code(404).send({ success: false, error: 'Group not found' });
      }
      // Build data payload
      const data: any = { updatedAt: new Date() };
      if (body.subject) data.subject = body.subject;
      if (body.description) data.description = body.description;
      if (body.isAnnounceGroup !== undefined) data.is_announce_group = body.isAnnounceGroup;
      // Update using jid (unique)
      const group = await prisma.whatsAppGroup.update({ where: { jid }, data });
      return { success: true, data: { group } };
    } catch (e: any) {
      if (e instanceof z.ZodError) return reply.code(400).send({ success: false, error: 'Validation error' });
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // DELETE
  fastify.delete('/:jid', async (request, reply) => {
    try {
      const { jid } = request.params as { jid: string };
      await prisma.$executeRaw`DELETE FROM whatsapp_groups WHERE "orgId" = ${orgId(request)} AND jid = ${jid}`;
      return { success: true, data: null };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // PARTICIPANTS LIST
  fastify.get('/:jid/participants', async (request, reply) => {
    try {
      const { jid } = request.params as { jid: string };
      const participants = await prisma.$queryRaw`SELECT * FROM whatsapp_group_participants WHERE group_jid = ${jid}`;
      return { success: true, data: { participants } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // ADD PARTICIPANT
  fastify.post('/:jid/participants', async (request, reply) => {
    try {
      const { jid } = request.params as { jid: string };
      const { phoneNumber } = request.body as { phoneNumber: string };
      if (!phoneNumber) return reply.code(400).send({ success: false, error: 'phoneNumber required' });

      const participant = await prisma.$executeRaw`
        INSERT INTO whatsapp_group_participants (id, group_jid, phone_number, is_admin, joined_at)
        VALUES (${`temp-${Date.now()}`}, ${jid}, ${phoneNumber}, false, NOW())
        RETURNING *
      `;
      return { success: true, data: { participant } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // REMOVE PARTICIPANT
  fastify.delete('/:jid/participants/:participantJid', async (request, reply) => {
    try {
      const { jid, participantJid } = request.params as { jid: string; participantJid: string };
      if (!participantJid) return reply.code(400).send({ success: false, error: 'participantJid required' });
      await prisma.$executeRaw`DELETE FROM whatsapp_group_participants WHERE group_jid = ${jid} AND phone_number = ${participantJid}`;
      return { success: true, data: null };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
