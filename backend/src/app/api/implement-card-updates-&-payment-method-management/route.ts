/**
 * Payment Method Management API
 * Endpoints for organizations to manage their payment methods (cards)
 * Base path: /api/payment-methods
 *
 * Protected by auth + orgGuard middleware. Requires ORG_ADMIN role.
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import {
  addPaymentMethod,
  listPaymentMethods,
  setDefaultPaymentMethod,
  removePaymentMethod,
  getDefaultPaymentMethod,
} from '../../../lib/implement-card-updates-&-payment-method-management';
import { checkFeatureAccess } from '../../../lib/feature-management';

// Validation schemas
const addPaymentMethodSchema = z.object({
  authorizationCode: z.string().min(10),
});

// ============================================================================
// Authorization Helper
// ============================================================================

function isOrgAdmin(request: FastifyRequest): boolean {
  const role = (request as any).user?.role;
  const orgId = (request as any).user?.orgId;
  return role === 'ORG_ADMIN' && !!orgId;
}

function getOrgId(request: FastifyRequest): string {
  return (request as any).user?.orgId;
}

/**
 * Check if payments feature is enabled for the organization
 */
async function requirePaymentsFeature(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const orgId = getOrgId(request);
  const userRole = (request as any).user?.role;

  // SUPER_ADMIN bypasses feature checks
  if (userRole === 'SUPER_ADMIN') {
    return true;
  }

  const { enabled } = await checkFeatureAccess(orgId, 'payments_enabled');
  if (!enabled) {
    reply.code(402);
    reply.send({
      success: false,
      error: 'Payments Disabled',
      message: 'Payment methods are currently disabled for your organization. Please contact your administrator.',
    });
    return false;
  }
  return true;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/payment-methods
 * Add a new payment method (card) to the organization
 */
export async function addPaymentMethodHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN access required' };
    }

    // Check payments feature flag
    const hasAccess = await requirePaymentsFeature(request, reply);
    if (!hasAccess) {
      return; // reply already sent
    }

    const body = addPaymentMethodSchema.parse(request.body);
    const orgId = getOrgId(request);

    const paymentMethod = await addPaymentMethod(orgId, body.authorizationCode);

    return { success: true, data: paymentMethod };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400);
      return { success: false, error: 'Invalid input: authorizationCode required' };
    }
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /api/payment-methods
 * List all payment methods for the organization
 */
export async function listPaymentMethodsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN access required' };
    }

    // Check payments feature flag
    const hasAccess = await requirePaymentsFeature(request, reply);
    if (!hasAccess) {
      return; // reply already sent
    }

    const orgId = getOrgId(request);
    const methods = await listPaymentMethods(orgId);

    return { success: true, data: methods };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * POST /api/payment-methods/:id/set-default
 * Set a payment method as the default for the organization
 */
export async function setDefaultHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN access required' };
    }

    // Check payments feature flag
    const hasAccess = await requirePaymentsFeature(request, reply);
    if (!hasAccess) {
      return; // reply already sent
    }

    const { id } = request.params as { id: string };
    const orgId = getOrgId(request);

    const paymentMethod = await setDefaultPaymentMethod(orgId, id);

    return { success: true, data: paymentMethod };
  } catch (error: any) {
    if (error.message === 'Payment method not found') {
      reply.code(404);
      return { success: false, error: 'Payment method not found' };
    }
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * DELETE /api/payment-methods/:id
 * Remove a payment method from the organization
 */
export async function removePaymentMethodHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN access required' };
    }

    // Check payments feature flag
    const hasAccess = await requirePaymentsFeature(request, reply);
    if (!hasAccess) {
      return; // reply already sent
    }

    const { id } = request.params as { id: string };
    const orgId = getOrgId(request);

    await removePaymentMethod(orgId, id);

    return { success: true, data: null };
  } catch (error: any) {
    if (error.message === 'Payment method not found') {
      reply.code(404);
      return { success: false, error: 'Payment method not found' };
    }
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerPaymentMethodRoutes(app: any, options: { prefix?: string } = {}) {
  const prefix = options.prefix || '/api/payment-methods';

  app.post('/', addPaymentMethodHandler);
  app.get('/', listPaymentMethodsHandler);
  app.post('/:id/set-default', setDefaultHandler);
  app.delete('/:id', removePaymentMethodHandler);
}
