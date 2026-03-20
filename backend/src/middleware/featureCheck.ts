/**
 * Feature Check Middleware
 * Enforces feature flag access control for billing-related features.
 *
 * Usage:
 *   In route.ts, add:
 *   import { requireFeature } from '../middleware/featureCheck';
 *   Then in handler: check feature with orgId from request.user
 *
 * Or use as preHandler to protect entire routes:
 *   app.post('/some-route', { preHandler: [requireFeature('payments_enabled')] }, handler);
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { checkFeatureAccess } from '../lib/feature-management';

/**
 * Get organization ID from authenticated user
 */
function getOrgIdFromRequest(request: FastifyRequest): string | null {
  return (request as any).user?.orgId || null;
}

/**
 * Get user role from authenticated user
 */
function getUserRole(request: FastifyRequest): string | null {
  return (request as any).user?.role || null;
}

/**
 * Create a preHandler middleware that checks if a feature is enabled
 * for the requesting organization or SUPER_ADMIN.
 *
 * @param featureKey - The feature flag key to check
 * @returns Fastify preHandler function
 *
 * Behavior:
 * - SUPER_ADMIN: bypasses feature checks (always allowed)
 * - ORG_ADMIN/MANAGER/AGENT/VIEWER: checked against org's feature access
 * - If no orgId in user context and not SUPER_ADMIN: returns 403
 * - If feature disabled for org: returns 402 (Payment Required) or 403 (Forbidden)
 */
export function requireFeature(featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userRole = getUserRole(request);
      const orgId = getOrgIdFromRequest(request);

      // SUPER_ADMIN bypasses feature checks
      if (userRole === 'SUPER_ADMIN') {
        return;
      }

      // Non-SUPER_ADMIN must have org context
      if (!orgId) {
        reply.code(403);
        reply.send({
          success: false,
          error: 'Forbidden',
          message: 'Organization context required for feature access',
        });
        return;
      }

      // Check feature access
      const { enabled } = await checkFeatureAccess(orgId, featureKey as any);

      if (!enabled) {
        reply.code(402); // 402 Payment Required is appropriate for billing features
        reply.send({
          success: false,
          error: 'Feature Not Available',
          message: `The feature "${featureKey}" is not enabled for your organization. Please upgrade your plan or contact support.`,
          featureKey,
        });
        return;
      }

      // Feature is enabled, continue
    } catch (error: any) {
      console.error(`[FeatureCheck] Error checking feature "${featureKey}":`, error);
      reply.code(500);
      reply.send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to verify feature access',
      });
    }
  };
}

/**
 * Helper to check feature and throw reply-based error in handler
 * Use this inside route handlers when you need inline checks.
 *
 * @param request - Fastify request
 * @param reply - Fastify reply
 * @param featureKey - Feature to check
 * @param orgId - Optional orgId (defaults to request.user.orgId)
 * @returns Promise<boolean> - true if allowed, false if denied (reply already sent)
 */
export async function checkFeatureInHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  featureKey: string,
  orgId?: string | null
): Promise<boolean> {
  const userRole = getUserRole(request);
  const effectiveOrgId = orgId || getOrgIdFromRequest(request);

  // SUPER_ADMIN bypasses
  if (userRole === 'SUPER_ADMIN') {
    return true;
  }

  if (!effectiveOrgId) {
    reply.code(403);
    reply.send({
      success: false,
      error: 'Forbidden',
      message: 'Organization context required',
    });
    return false;
  }

  const { enabled, reason } = await checkFeatureAccess(effectiveOrgId, featureKey as any);

  if (!enabled) {
    reply.code(402);
    reply.send({
      success: false,
      error: 'Feature Not Available',
      message: `Feature "${featureKey}" is disabled. Reason: ${reason}`,
      featureKey,
      reason,
    });
    return false;
  }

  return true;
}
