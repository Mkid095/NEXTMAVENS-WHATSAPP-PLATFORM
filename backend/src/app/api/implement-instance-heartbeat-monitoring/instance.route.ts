/**
 * Instance Heartbeat API
 *
 * Endpoint for WhatsApp instances to send periodic heartbeats.
 * Path: POST /api/instances/:id/heartbeat
 * Access: Public (bypasses JWT auth), but requires instance token header.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { heartbeat as recordHeartbeat, initializeHeartbeatMonitoring } from '../../../lib/implement-instance-heartbeat-monitoring';
import { prisma } from '../../../lib/prisma';

const heartbeatBodyZod = z.object({
  metrics: z
    .object({
      cpu: z.number().min(0).max(1).optional(),
      memory: z.number().min(0).max(1).optional(),
      queueSize: z.number().int().nonnegative().optional(),
      uptime: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const emptySchema = z.object({}).toJSONSchema();
delete (emptySchema as any).$schema;

export default async function (fastify: FastifyInstance) {
  // Ensure the heartbeat monitoring system is initialized
  initializeHeartbeatMonitoring();

  fastify.post(
    '/:id/heartbeat',
    { schema: { body: emptySchema } },
    async (request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) => {
      try {
        const { id: instanceId } = request.params;

        // Verify instance exists and token matches
        const instance = await prisma.whatsAppInstance.findUnique({
          where: { id: instanceId },
          select: { id: true, token: true, orgId: true },
        });

        if (!instance) {
          return reply.code(404).send({
            success: false,
            error: 'Instance not found',
          });
        }

        // Simple token check: instance sends its token in Authorization header as Bearer
        const authHeader = request.headers.authorization || '';
        const tokenMatch = authHeader.replace(/^Bearer\s+/, '');

        if (!tokenMatch || tokenMatch !== instance.token) {
          return reply.code(401).send({
            success: false,
            error: 'Invalid instance token',
          });
        }

        // Parse optional metrics from body (ignore if empty)
        const body = request.body || {};
        const metrics = heartbeatBodyZod.parse(body).metrics;

        // Record heartbeat
        await recordHeartbeat(instanceId, metrics);

        return {
          success: true,
          data: {
            instanceId,
            status: 'OK',
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error: any) {
        console.error('[Heartbeat] Error processing heartbeat:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to process heartbeat',
        });
      }
    }
  );
}
