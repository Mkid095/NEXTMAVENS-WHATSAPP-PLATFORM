import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

// Zod schemas for validation
const createInstanceSchema = z.object({
  name: z.string().min(1).max(255),
  evolutionInstanceName: z.string().optional(),
  phoneNumber: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export default async function (fastify: FastifyInstance) {
  fastify.route({
    method: 'GET',
    url: '/whatsapp/instances',
    handler: async (request, reply) => {
      // orgGuard sets request.currentOrgId
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

  fastify.route({
    method: 'POST',
    url: '/whatsapp/instances',
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

      return { success: true, data: { instance } };
    },
  });

  fastify.route({
    method: 'GET',
    url: '/whatsapp/instances/:id',
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

  fastify.route({
    method: 'PUT',
    url: '/whatsapp/instances/:id',
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

  fastify.route({
    method: 'DELETE',
    url: '/whatsapp/instances/:id',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      // Verify instance exists and belongs to org
      const existing = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
      });

      if (!existing) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      await prisma.whatsAppInstance.delete({
        where: { id },
      });

      return { success: true, data: null };
    },
  });

  // Connect to WhatsApp instance (initiate QR flow)
  fastify.route({
    method: 'POST',
    url: '/whatsapp/instances/:id/connect',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      // Verify instance exists and belongs to org
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: { id: true, evolutionInstanceName: true, status: true },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      if (!instance.evolutionInstanceName) {
        reply.code(400);
        return { success: false, error: 'Evolution instance name not configured' };
      }

      // Update status to CONNECTING
      await prisma.whatsAppInstance.update({
        where: { id },
        data: { status: 'CONNECTING' },
      });

      // TODO: Call Evolution API to initiate connection (will generate QR)
      // For now, just return success
      return { success: true, data: { message: 'Connection initiated', instanceId: id } };
    },
  });

  // Get QR code for instance
  fastify.route({
    method: 'GET',
    url: '/whatsapp/instances/:id/qr',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: { id: true, qrCode: true, status: true, evolutionInstanceName: true },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      // If QR not generated yet, we could fetch from Evolution API
      // For now, return stored QR code (if any)
      return { success: true, data: { qrCode: instance.qrCode, status: instance.status } };
    },
  });

  // Get instance status
  fastify.route({
    method: 'GET',
    url: '/whatsapp/instances/:id/status',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: { id: true, status: true, heartbeatStatus: true, lastSeen: true },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      return { success: true, data: { status: instance.status, heartbeatStatus: instance.heartbeatStatus, lastSeen: instance.lastSeen } };
    },
  });

  // Disconnect instance
  fastify.route({
    method: 'POST',
    url: '/whatsapp/instances/:id/disconnect',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: { id: true, status: true },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      // Update status to DISCONNECTED
      await prisma.whatsAppInstance.update({
        where: { id },
        data: { status: 'DISCONNECTED', qrCode: null },
      });

      // TODO: Call Evolution API to logout instance

      return { success: true, data: { message: 'Disconnected', instanceId: id } };
    },
  });

  // Additional instance-specific endpoints can be added here in future tasks
}
