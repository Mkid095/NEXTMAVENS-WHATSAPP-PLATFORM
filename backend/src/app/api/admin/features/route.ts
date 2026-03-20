/**
 * Admin Feature Management API
 * Endpoints for SUPER_ADMIN to manage global feature flags and org overrides
 * Base path: /admin/features
 *
 * Requires SUPER_ADMIN role (enforced by isAuthorized helper)
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import * as featureService from '../../../../lib/feature-management';
import { prisma } from '../../../../lib/prisma';

// ============================================================================
// Validation Schemas
// ============================================================================

const toggleFeatureSchema = z.object({
  enabled: z.boolean(),
});

const orgFeatureOverrideSchema = z.object({
  enabled: z.boolean().nullable(),
});

// ============================================================================
// Authorization Helper
// ============================================================================

function isSuperAdmin(request: FastifyRequest): boolean {
  const userRole = (request as any).user?.role;
  return userRole === 'SUPER_ADMIN';
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /admin/features
 * List all feature flags with global states and summary of org overrides
 */
export async function listFeaturesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isSuperAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: SUPER_ADMIN access required' };
    }

    const [flags, allOverrides] = await Promise.all([
      featureService.listFeatureFlags(),
      prisma.organizationFeatureFlag.findMany({
        include: {
          org: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          orgId: 'asc',
        },
      }),
    ]);

    // Group overrides by feature key
    type OverrideSummary = {
      orgId: string;
      orgName: string;
      enabled: boolean | null;
    };
    const overridesByFeature = new Map<string, OverrideSummary[]>();
    for (const o of allOverrides) {
      const existing = overridesByFeature.get(o.featureKey) || [];
      existing.push({
        orgId: o.org.id,
        orgName: o.org.name,
        enabled: o.enabled,
      });
      overridesByFeature.set(o.featureKey, existing);
    }

    const response = flags.map((flag) => ({
      featureKey: flag.key,
      name: flag.name,
      description: flag.description,
      globalEnabled: flag.enabled,
      orgOverrides: overridesByFeature.get(flag.key) || [],
      overrideCount: overridesByFeature.get(flag.key)?.length || 0,
    }));

    return { success: true, data: response };
  } catch (error: any) {
    console.error('[AdminFeatures] Error listing features:', error);
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * POST /admin/features/:key
 * Enable or disable a global feature flag
 */
export async function setGlobalFeatureHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isSuperAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: SUPER_ADMIN access required' };
    }

    const { key } = request.params as { key: string };
    const body = toggleFeatureSchema.parse(request.body);

    // Validate key is a known feature flag
    const validKeys: string[] = [
      'billing_enabled',
      'payments_enabled',
      'invoices_enabled',
      'usage_billing_enabled',
      'tax_enabled',
      'coupons_enabled',
    ];
    if (!validKeys.includes(key)) {
      reply.code(400);
      return { success: false, error: 'Invalid feature flag key' };
    }

    const flag = await featureService.setFeatureFlag(key as any, body.enabled);

    return {
      success: true,
      data: flag,
      message: `Feature flag "${key}" set to ${body.enabled}`,
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400);
      return { success: false, error: 'Invalid request: enabled (boolean) required' };
    }
    console.error(`[AdminFeatures] Error setting global feature ${(request.params as any).key}:`, error);
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /admin/features/org/:orgId
 * List all feature overrides for a specific organization
 */
export async function listOrgOverridesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isSuperAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: SUPER_ADMIN access required' };
    }

    const { orgId } = request.params as { orgId: string };

    // Verify org exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true },
    });

    if (!org) {
      reply.code(404);
      return { success: false, error: 'Organization not found' };
    }

    const overrides = await featureService.listOrgFeatureOverrides(orgId);

    // Fetch global flag states for each feature
    const featuresWithStates = await Promise.all(
      overrides.map(async (override) => {
        const globalFlag = await featureService.getFeatureFlag(override.featureKey);
        return {
          ...override,
          globalValue: globalFlag?.enabled ?? false,
          effectiveValue: override.enabled !== null ? override.enabled : globalFlag?.enabled ?? false,
        };
      })
    );

    return {
      success: true,
      data: {
        org: { id: org.id, name: org.name, slug: org.slug },
        overrides: featuresWithStates,
      },
    };
  } catch (error: any) {
    console.error(`[AdminFeatures] Error listing org overrides for ${(request.params as any).orgId}:`, error);
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * POST /admin/features/org/:orgId/:key
 * Set organization feature override (or remove by passing enabled: null)
 */
export async function setOrgOverrideHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isSuperAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: SUPER_ADMIN access required' };
    }

    const { orgId, key } = request.params as { orgId: string; key: string };
    const body = orgFeatureOverrideSchema.parse(request.body);

    // Validate key
    const validKeys: string[] = [
      'billing_enabled',
      'payments_enabled',
      'invoices_enabled',
      'usage_billing_enabled',
      'tax_enabled',
      'coupons_enabled',
    ];
    if (!validKeys.includes(key)) {
      reply.code(400);
      return { success: false, error: 'Invalid feature flag key' };
    }

    // Verify org exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      reply.code(404);
      return { success: false, error: 'Organization not found' };
    }

    const override = await featureService.setOrgFeatureOverride(
      orgId,
      key as any,
      body.enabled
    );

    const message =
      body.enabled === null
        ? `Override removed for org "${orgId}" feature "${key}"`
        : `Override set for org "${orgId}" feature "${key}" to ${body.enabled}`;

    return {
      success: true,
      data: override,
      message,
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400);
      return { success: false, error: 'Invalid request: enabled (boolean | null) required' };
    }
    console.error(`[AdminFeatures] Error setting org override ${(request.params as any).orgId}/${(request.params as any).key}:`, error);
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * DELETE /admin/features/org/:orgId/:key
 * Remove organization feature override (same as POST with enabled: null)
 */
export async function deleteOrgOverrideHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isSuperAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: SUPER_ADMIN access required' };
    }

    const { orgId, key } = request.params as { orgId: string; key: string };

    // Validate key
    const validKeys: string[] = [
      'billing_enabled',
      'payments_enabled',
      'invoices_enabled',
      'usage_billing_enabled',
      'tax_enabled',
      'coupons_enabled',
    ];
    if (!validKeys.includes(key)) {
      reply.code(400);
      return { success: false, error: 'Invalid feature flag key' };
    }

    const deleted = await featureService.deleteOrgFeatureOverride(orgId, key as any);

    if (!deleted) {
      reply.code(404);
      return { success: false, error: 'Override not found' };
    }

    return {
      success: true,
      data: null,
      message: `Override removed for org "${orgId}" feature "${key}"`,
    };
  } catch (error: any) {
    console.error(`[AdminFeatures] Error deleting org override ${(request.params as any).orgId}/${(request.params as any).key}:`, error);
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerFeatureRoutes(app: any, options: { prefix?: string } = {}) {
  const prefix = options.prefix || '/admin/features';

  // GET /admin/features - list all feature flags
  app.get('/', listFeaturesHandler);

  // POST /admin/features/:key - set global flag
  app.post('/:key', setGlobalFeatureHandler);

  // GET /admin/features/org/:orgId - list org overrides
  app.get('/org/:orgId', listOrgOverridesHandler);

  // POST /admin/features/org/:orgId/:key - set org override
  app.post('/org/:orgId/:key', setOrgOverrideHandler);

  // DELETE /admin/features/org/:orgId/:key - remove org override
  app.delete('/org/:orgId/:key', deleteOrgOverrideHandler);
}
