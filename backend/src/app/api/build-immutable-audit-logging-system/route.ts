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
import type { FastifyReply, FastifyRequest } from 'fastify';
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
  fastify.get('/', {
    schema: {
      querystring: auditLogQuerySchema,
    },
  }, async (request: FastifyRequest<{ Querystring: QueryAuditLogsDto }>, reply: FastifyReply) => {
    try {
      const query = request.query as QueryAuditLogsDto;

      // Convert string dates to Date objects
      if (query.startDate) {
        query.startDate = new Date(query.startDate);
      }
      if (query.endDate) {
        query.endDate = new Date(query.endDate);
      }

      const result = await getAuditLogs(query);
      return reply.send(result);
    } catch (error) {
      if (error instanceof ZodError) {
        throw error; // Let Fastify handle validation errors (400)
      }
      throw error;
    }
  });

  // ------------------------------------------------------------------------
  // GET /:id - Get audit log by ID
  // ------------------------------------------------------------------------
  fastify.get('/:id', {
    schema: {
      params: z.object({
        id: z.string().cuid(),
      }),
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const log = await getAuditLogById(id);
    if (!log) {
      throw fastify.httpErrors.NotFound('Audit log not found');
    }

    return reply.send(log);
  });
}
