/**
 * Instance Heartbeat Admin API
 *
 * Admin endpoints for viewing instance health status.
 * Path: GET /admin/instances/heartbeat
 * Access: Requires SUPER_ADMIN or ORG_ADMIN (with orgGuard)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getInstancesStatus } from '../../../lib/implement-instance-heartbeat-monitoring';

const queryZod = z.object({
  status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']).optional(),
  orgId: z.string().optional(),
});

const querySchema = queryZod.toJSONSchema();
delete (querySchema as any).$schema;

export default async function (fastify: FastifyInstance) {
  fastify.get(
    '/heartbeat',
    { schema: { querystring: querySchema } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { status, orgId } = queryZod.parse(request.query);

        // Get the authenticated user from auth middleware
        const user = (request as any).user as {
          id: string;
          role: string;
          orgId?: string;
        } | null;

        if (!user) {
          return reply.code(401).send({
            success: false,
            error: 'Unauthorized',
          });
        }

        // Only SUPER_ADMIN and ORG_ADMIN can access this endpoint
        if (user.role !== 'SUPER_ADMIN' && user.role !== 'ORG_ADMIN') {
          return reply.code(403).send({
            success: false,
            error: 'Access denied: admin role required',
          });
        }

        // ORG_ADMIN can only view their own org unless they're SUPER_ADMIN
        let filterOrgId = orgId;
        if (user.role !== 'SUPER_ADMIN') {
          // Non-superadmin can only view their own org
          if (orgId && orgId !== user.orgId) {
            return reply.code(403).send({
              success: false,
              error: 'Access denied: cannot view other org data',
            });
          }
          filterOrgId = user.orgId;
        }

        // Fetch instances status
        const instances = await getInstancesStatus(filterOrgId, status);

        // Calculate summary
        const summary = {
          total: instances.length,
          online: instances.filter((i: any) => i.status === 'ONLINE').length,
          offline: instances.filter((i: any) => i.status === 'OFFLINE').length,
          unknown: instances.filter((i: any) => i.status === 'UNKNOWN').length,
        };

        return {
          success: true,
          data: {
            instances,
            summary,
          },
        };
      } catch (error: any) {
        console.error('[HeartbeatAdmin] Error fetching status:', error);
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid query parameters',
            details: error.format(),
          });
        }
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch instance status',
        });
      }
    }
  );
}
