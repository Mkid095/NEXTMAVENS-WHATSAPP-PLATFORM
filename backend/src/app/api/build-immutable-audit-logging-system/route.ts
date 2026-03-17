/**
 * Immutable Audit Logging API
 *
 * Admin endpoints for querying immutable audit logs.
 *
 * Base path: /admin/audit-logs
 *
 * Endpoints:
 * - GET    /                      - List audit logs (with filters)
 * - GET    /:id                   - Get audit log by ID
 *
 * Access: Requires authentication + orgGuard (SUPER_ADMIN or ORG_ADMIN for their org)
 *
 * Note: Audit logs are immutable. No update or delete operations are provided.
 */

import { z, ZodError } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  getAuditLogs,
  getAuditLogById,
  type QueryAuditLogsDto,
} from '../../../lib/build-immutable-audit-logging-system';

// ============================================================================
// Zod Schemas
// ============================================================================

const auditLogQuerySchema = z.object({
  orgId: z.string().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

// ============================================================================
// Plugin Registration
// ============================================================================

export default async function (fastify: FastifyInstance) {
  // ------------------------------------------------------------------------
  // GET / - List audit logs with optional filters
  // ------------------------------------------------------------------------
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate query parameters
      const parsedQuery = auditLogQuerySchema.parse(request.query);

      // Build DTO with proper types (convert string dates to Date objects)
      const query: QueryAuditLogsDto = {
        orgId: parsedQuery.orgId,
        userId: parsedQuery.userId,
        action: parsedQuery.action,
        resource: parsedQuery.resource,
        resourceId: parsedQuery.resourceId,
        startDate: parsedQuery.startDate ? new Date(parsedQuery.startDate) : undefined,
        endDate: parsedQuery.endDate ? new Date(parsedQuery.endDate) : undefined,
        page: parsedQuery.page,
        limit: parsedQuery.limit,
      };

      const result = await getAuditLogs(query);
      return reply.send(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation error', details: error.format() });
      }
      console.error('[AuditLog] Error fetching logs:', error);
      return reply.code(500).send({ error: 'Failed to fetch audit logs' });
    }
  });

  // ------------------------------------------------------------------------
  // GET /:id - Get audit log by ID
  // ------------------------------------------------------------------------
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // Validate ID format (cuid)
      const idSchema = z.string().cuid();
      idSchema.parse(id);

      const log = await getAuditLogById(id);
      if (!log) {
        return reply.code(404).send({ error: 'Audit log not found' });
      }

      return reply.send(log);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid ID format', details: error.format() });
      }
      console.error('[AuditLog] Error fetching log:', error);
      return reply.code(500).send({ error: 'Failed to fetch audit log' });
    }
  });
}
