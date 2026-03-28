import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { getEvolutionClient } from '../../../lib/evolution-api-client/instance';
import { getSocketService } from '../../../lib/build-real-time-messaging-with-socket.io';

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

      try {
        // Call Evolution API to get fresh QR code
        const evo = getEvolutionClient();
        const qrResult = await evo.connect(instance.evolutionInstanceName);

        // Store QR in DB and set status to CONNECTING
        await prisma.whatsAppInstance.update({
          where: { id },
          data: {
            status: 'CONNECTING',
            qrCode: qrResult.base64,
          },
        });

        // Broadcast QR update via Socket.IO
        const socketService = getSocketService();
        if (socketService) {
          socketService.broadcastToInstance(id, 'whatsapp:instance:qr:update', {
            instanceId: id,
            qrCode: qrResult.base64,
            status: 'CONNECTING',
            timestamp: Date.now(),
          });
        }

        return { success: true, data: { message: 'Connection initiated', instanceId: id } };
      } catch (error: any) {
        console.error('Evolution connect error:', error);
        reply.code(500);
        return { success: false, error: 'Failed to connect to Evolution API', details: error.message };
      }
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
        select: { id: true, qrCode: true, status: true, evolutionInstanceName: true, updatedAt: true },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      // If we have a QR code and it's recent (within last 60 seconds), return it
      // Otherwise, fetch fresh QR from Evolution API
      const needsFreshQR = !instance.qrCode ||
        !instance.updatedAt ||
        (Date.now() - new Date(instance.updatedAt).getTime()) > 60000; // 60 seconds

      if (needsFreshQR && instance.evolutionInstanceName) {
        try {
          const evo = getEvolutionClient();
          const qrResult = await evo.connect(instance.evolutionInstanceName);

          // Update DB with fresh QR
          await prisma.whatsAppInstance.update({
            where: { id },
            data: { qrCode: qrResult.base64 },
          });

          // Broadcast QR refresh
          const socketService = getSocketService();
          if (socketService) {
            socketService.broadcastToInstance(id, 'whatsapp:instance:qr:update', {
              instanceId: id,
              qrCode: qrResult.base64,
              status: instance.status,
              timestamp: Date.now(),
            });
          }

          // Return fresh QR with computed expiry (60s from now)
          const expiresAt = new Date(Date.now() + 60000).toISOString();
          return { success: true, data: { qrCode: qrResult.base64, status: instance.status, expiresAt } };
        } catch (error) {
          console.error('Failed to fetch fresh QR from Evolution:', error);
          // Return stale QR if available, otherwise error
          if (!instance.qrCode) {
            reply.code(500);
            return { success: false, error: 'Failed to fetch QR code' };
          }
        }
      }

      // Return stored QR with computed expiry
      const expiresAt = instance.updatedAt ? new Date(new Date(instance.updatedAt).getTime() + 60000).toISOString() : undefined;
      return { success: true, data: { qrCode: instance.qrCode, status: instance.status, expiresAt } };
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

      try {
        // Call Evolution API to logout
        const evo = getEvolutionClient();
        await evo.logoutInstance(instance.evolutionInstanceName);
      } catch (error) {
        console.error('Evolution logout error:', error);
        // Continue even if Evolution logout fails (instance might already be logged out)
      }

      // Update status to DISCONNECTED and clear QR
      await prisma.whatsAppInstance.update({
        where: { id },
        data: { status: 'DISCONNECTED', qrCode: null },
      });

      // Broadcast status change
      const socketService = getSocketService();
      if (socketService) {
        socketService.broadcastToInstance(id, 'whatsapp:instance:status', {
          instanceId: id,
          status: 'DISCONNECTED',
          timestamp: Date.now(),
        });
      }

      return { success: true, data: { message: 'Disconnected', instanceId: id } };
    },
  });

  // Additional instance-specific endpoints can be added here in future tasks
}
