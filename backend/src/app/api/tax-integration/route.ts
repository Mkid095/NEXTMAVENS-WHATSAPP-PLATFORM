/**
 * Tax Configuration API
 * Endpoints for retrieving and managing tax settings
 * Base path: /api/tax
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { getTaxConfig, updateTaxConfig } from '../../../lib/tax-integration';

// ============================================================================
// Validation Schemas
// ============================================================================

const taxConfigSchema = z.object({
  taxRate: z.number().positive().optional(),
  taxName: z.string().min(1).max(100).optional(),
  taxId: z.string().min(1).max(100).optional(),
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/tax/config
 * Get tax configuration for current organization
 */
export async function getTaxConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.headers['x-org-id'] as string;
    if (!orgId) {
      reply.code(400);
      return { success: false, error: 'Missing x-org-id header' };
    }

    const taxConfig = await getTaxConfig(orgId);
    return { success: true, data: taxConfig };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * POST /api/tax/config
 * Update tax configuration for organization (admin only)
 */
export async function updateTaxConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.headers['x-org-id'] as string;
    if (!orgId) {
      reply.code(400);
      return { success: false, error: 'Missing x-org-id header' };
    }

    // Check role - only SUPER_ADMIN or ORG_ADMIN can update tax config
    const userRole = (request as any).user?.role;
    if (!userRole || (userRole !== 'SUPER_ADMIN' && userRole !== 'ORG_ADMIN')) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Admin role required' };
    }

    // ORG_ADMIN can only update their own org; SUPER_ADMIN can update any
    const userId = (request as any).user?.id;
    const userOrgId = (request as any).user?.orgId;
    if (userRole === 'ORG_ADMIN' && userOrgId !== orgId) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Can only modify your own organization' };
    }

    const body = taxConfigSchema.parse(request.body);

    // If taxRate is provided, must be positive; if not provided, leave unchanged
    const updates: { taxRate?: number | null; taxName?: string | null; taxId?: string | null } = {};
    if (body.taxRate !== undefined) {
      updates.taxRate = body.taxRate > 0 ? body.taxRate : null;
    }
    if (body.taxName !== undefined) updates.taxName = body.taxName;
    if (body.taxId !== undefined) updates.taxId = body.taxId;

    const taxConfig = await updateTaxConfig(orgId, updates.taxRate ?? undefined, updates.taxName ?? undefined, updates.taxId ?? undefined);
    return { success: true, data: taxConfig };
  } catch (error: any) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      reply.code(400);
      return { success: false, error: 'Invalid input: taxRate must be positive number' };
    }

    // Handle not found errors
    if (error.message?.includes('not found')) {
      reply.code(404);
      return { success: false, error: error.message };
    }

    // Generic server error
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerTaxRoutes(app: any, options: { prefix?: string } = {}) {
  const prefix = options.prefix || '/api/tax';

  app.get('/config', getTaxConfigHandler);
  app.post('/config', updateTaxConfigHandler);
}
