/**
 * WhatsApp Instance CRUD Operations
 *
 * Handles basic lifecycle: list, create, read, update, delete
 * Base path: /whatsapp/instances
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { getSocketService } from '../../../lib/build-real-time-messaging-with-socket.io';

// Zod schema for instance creation/update
const createInstanceSchema = z.object({
  name: z.string().min(1).max(255),
  evolutionInstanceName: z.string().optional(),
  phoneNumber: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export default async function (fastify: FastifyInstance) {
  // ============================================================================
  // LIST INSTANCES
  // ============================================================================
  fastify.route({
    method: 'GET',
    url: '/',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;

      const instances = await prisma.whatsAppInstance.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          evolutionInstanceName: true,
          phoneNumber: true,
          status: true,
          isPrimary: true,
          createdAt: true,
          updatedAt: true,
          lastSeen: true,
        },
      });

      return { success: true, data: { instances } };
    },
  });

  // ============================================================================
  // CREATE INSTANCE
  // ============================================================================
  fastify.route({
    method: 'POST',
    url: '/',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;

      // Validate body
      const validated = createInstanceSchema.parse(request.body);

      const instance = await prisma.whatsAppInstance.create({
        data: {
          ...validated,
          orgId,
        } as any,
        select: {
          id: true,
          name: true,
          evolutionInstanceName: true,
          phoneNumber: true,
          status: true,
          isPrimary: true,
          orgId: true,
          updatedAt: true,
        },
      });

      // Broadcast instance creation to all org members
      const socketService = getSocketService();
      if (socketService) {
        socketService.broadcastToOrg(orgId, 'whatsapp:instance:created', {
          instance,
        });
      }

      return { success: true, data: { instance } };
    },
  });

  // ============================================================================
  // GET SINGLE INSTANCE
  // ============================================================================
  fastify.route({
    method: 'GET',
    url: '/:id',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: {
          id: true,
          name: true,
          evolutionInstanceName: true,
          phoneNumber: true,
          status: true,
          isPrimary: true,
          token: true,
          qrCode: true,
          heartbeatStatus: true,
          createdAt: true,
          updatedAt: true,
          lastSeen: true,
        },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      return { success: true, data: { instance } };
    },
  });

  // ============================================================================
  // UPDATE INSTANCE
  // ============================================================================
  fastify.route({
    method: 'PUT',
    url: '/:id',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      const updateData = request.body;

      const instance = await prisma.whatsAppInstance.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          evolutionInstanceName: true,
          phoneNumber: true,
          status: true,
          isPrimary: true,
          orgId: true,
          updatedAt: true,
        },
      });

      // Verify org ownership (in case update bypassed where clause)
      if (instance.orgId !== orgId) {
        reply.code(403);
        return { success: false, error: 'Access denied' };
      }

      return { success: true, data: { instance } };
    },
  });

  // ============================================================================
  // DELETE INSTANCE
  // ============================================================================
  fastify.route({
    method: 'DELETE',
    url: '/:id',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      // Verify instance exists and belongs to org
      const existing = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: { id: true, evolutionInstanceName: true },
      });

      if (!existing) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      // Delete from Evolution API if it was created
      if (existing.evolutionInstanceName) {
        try {
          const { getEvolutionClient } = await import('../../../lib/evolution-api-client/instance');
          const evo = getEvolutionClient();
          await evo.deleteInstance(existing.evolutionInstanceName);
          console.log(`[DELETE] Deleted Evolution instance ${existing.evolutionInstanceName}`);
        } catch (error) {
          console.error(`[DELETE] Failed to delete Evolution instance ${existing.evolutionInstanceName}:`, error);
          // Continue with DB deletion even if Evolution deletion fails
        }
      }

      await prisma.whatsAppInstance.delete({
        where: { id },
      });

      // Broadcast instance deletion to all org members
      const socketService = getSocketService();
      if (socketService) {
        socketService.broadcastToOrg(orgId, 'whatsapp:instance:deleted', {
          instanceId: id,
        });
      }

      return { success: true, data: null };
    },
  });

  // ============================================================================
  // UPDATE PROFILE NAME
  // ============================================================================
  fastify.patch('/:id/profile/name', async (request, reply) => {
    try {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };
      const { name } = request.body as { name: string };
      if (!name) return reply.code(400).send({ success: false, error: 'name required' });

      // Verify ownership
      const existing = await prisma.whatsAppInstance.findFirst({ where: { id, orgId }, select: { id: true } });
      if (!existing) return reply.code(404).send({ success: false, error: 'Instance not found' });

      const instance = await prisma.whatsAppInstance.update({
        where: { id },
        data: { name },
        select: { id: true, name: true, updatedAt: true },
      });
      return { success: true, data: { instance } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });

  // ============================================================================
  // UPDATE PROFILE STATUS
  // ============================================================================
  fastify.patch('/:id/profile/status', async (request, reply) => {
    try {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };
      if (!status) return reply.code(400).send({ success: false, error: 'status required' });

      const existing = await prisma.whatsAppInstance.findFirst({ where: { id, orgId }, select: { id: true } });
      if (!existing) return reply.code(404).send({ success: false, error: 'Instance not found' });

      // Status should be stored as a string; Evolution API may have its own status sync
      const instance = await prisma.whatsAppInstance.update({
        where: { id },
        data: { status: status as any },
        select: { id: true, status: true, updatedAt: true },
      });
      return { success: true, data: { instance } };
    } catch (e: any) {
      reply.code(500).send({ success: false, error: e.message });
    }
  });
}
