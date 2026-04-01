/**
 * WhatsApp Instance Connection Management
 *
 * Handles connection flow: connect, get QR code, check status, disconnect
 * Base path: /whatsapp/instances/:id
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../../lib/prisma';
import { getEvolutionClient } from '../../../lib/evolution-api-client/instance';
import { getSocketService } from '../../../lib/build-real-time-messaging-with-socket.io';
import { provisionEvolutionInstance, fetchQrCodeFromEvolution } from './instance.evolution';

export default async function (fastify: FastifyInstance) {
  // ============================================================================
  // CONNECT TO WHATSAPP (INITIATE QR FLOW)
  // ============================================================================
  fastify.route({
    method: 'POST',
    url: '/:id/connect',
    handler: async (request, reply) => {
      const orgId = (request as any).currentOrgId as string;
      const { id } = request.params as { id: string };

      // Verify instance exists and belongs to org
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, orgId },
        select: { id: true, name: true, evolutionInstanceName: true, status: true },
      });

      if (!instance) {
        reply.code(404);
        return { success: false, error: 'Instance not found' };
      }

      try {
        let evolutionInstanceName = instance.evolutionInstanceName;
        const appUrl = process.env.APP_URL;

        // Lazy provisioning: if Evolution instance doesn't exist, create it
        if (!evolutionInstanceName) {
          if (!appUrl) {
            throw new Error('APP_URL environment variable is required for webhook configuration.');
          }
          evolutionInstanceName = await provisionEvolutionInstance(id, appUrl);
        }

        // Get fresh QR code from Evolution
        const qrResult = await fetchQrCodeFromEvolution(evolutionInstanceName);

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

  // ============================================================================
  // GET QR CODE
  // ============================================================================
  // IMPORTANT: This endpoint ALWAYS fetches a fresh QR code from Evolution.
  // Why? QR codes are single-use or time-limited. Returning a cached QR causes
  // "already scanned" or "expired" errors. We must generate a new QR on every request.
  fastify.route({
    method: 'GET',
    url: '/:id/qr',
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
        return { success: false, error: 'Evolution instance not configured. Please connect first.' };
      }

      // If already connected, no QR needed
      if (instance.status === 'CONNECTED') {
        return { success: false, error: 'Instance already connected. Disconnect first to get new QR.', code: 'ALREADY_CONNECTED' };
      }

      try {
        // ALWAYS fetch fresh QR - never use cached
        const qrResult = await fetchQrCodeFromEvolution(instance.evolutionInstanceName);

        // Store the fresh QR in DB (overwriting any previous one)
        await prisma.whatsAppInstance.update({
          where: { id },
          data: { qrCode: qrResult.base64 },
        });

        // Broadcast QR update to all connected clients
        const socketService = getSocketService();
        if (socketService) {
          socketService.broadcastToInstance(id, 'whatsapp:instance:qr:update', {
            instanceId: id,
            qrCode: qrResult.base64,
            status: instance.status,
            timestamp: Date.now(),
            isFresh: true,
          });
        }

        // Return fresh QR with 60-second expiry
        const expiresAt = new Date(Date.now() + 60000).toISOString();
        return { success: true, data: { qrCode: qrResult.base64, status: instance.status, expiresAt } };
      } catch (error: any) {
        console.error('Failed to fetch QR from Evolution:', error);
        return { success: false, error: 'Failed to fetch QR code', details: error.message };
      }
    },
  });

  // ============================================================================
  // GET INSTANCE STATUS
  // ============================================================================
  fastify.route({
    method: 'GET',
    url: '/:id/status',
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

  // ============================================================================
  // DISCONNECT INSTANCE
  // ============================================================================
  fastify.route({
    method: 'POST',
    url: '/:id/disconnect',
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
}
