/**
 * Coupon & Discount API
 * Endpoints for managing and applying coupons
 * Base path: /api/coupons
 *
 * Protected by auth + orgGuard middleware. ORG_ADMIN or BILLING_ADMIN required for write operations.
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import {
  createCoupon,
  getCoupon,
  listCoupons,
  validateCoupon,
  applyCoupon,
  deactivateCoupon,
  getCouponUsageStats,
  initializeDefaultCoupons,
} from '../../../lib/build-coupon-&-discount-system';
import { requireFeature } from '../../../shared/middleware/featureCheck.js';

// Validation schemas
const createCouponSchema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive(),
  maxUses: z.number().int().positive().optional(),
  perUserLimit: z.number().int().positive().optional(),
  minPurchaseAmount: z.number().nonnegative().optional(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
});

const applyCouponSchema = z.object({
  purchaseAmount: z.number().positive(),
  userId: z.string().optional(),
  orderId: z.string().optional(),
});

// ============================================================================
// Authorization Helpers
// ============================================================================

function isOrgAdmin(request: FastifyRequest): boolean {
  const role = (request as any).user?.role;
  const orgId = (request as any).user?.orgId;
  return (role === 'ORG_ADMIN' || role === 'BILLING_ADMIN') && !!orgId;
}

function getOrgId(request: FastifyRequest): string {
  return (request as any).user?.orgId;
}

function getUserId(request: FastifyRequest): string {
  return (request as any).user?.userId;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/coupons
 * Create a new coupon
 */
export async function createCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN or BILLING_ADMIN required' };
    }

    const body = createCouponSchema.parse(request.body);
    const orgId = getOrgId(request);
    const userId = getUserId(request);

    const coupon = await createCoupon({
      ...body,
      validFrom: new Date(body.validFrom),
      validTo: new Date(body.validTo),
      orgId,
      createdBy: userId,
    });

    return { success: true, data: coupon };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400);
      return { success: false, error: 'Invalid input', details: error.format() };
    }
    if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
      reply.code(409);
      return { success: false, error: 'Coupon code already exists' };
    }
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /api/coupons
 * List coupons for the organization
 */
export async function listCouponsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN or BILLING_ADMIN required' };
    }

    const orgId = getOrgId(request);
    const { code, limit = 50, offset = 0, isActive } = request.query as any;

    const result = await listCoupons({
      orgId,
      code: code as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    });

    return { success: true, data: result.coupons, total: result.total, limit, offset };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /api/coupons/:code
 * Get coupon details
 */
export async function getCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN or BILLING_ADMIN required' };
    }

    const { code } = request.params as { code: string };
    const orgId = getOrgId(request);

    const coupon = await getCoupon(code, orgId);
    if (!coupon) {
      reply.code(404);
      return { success: false, error: 'Coupon not found' };
    }

    return { success: true, data: coupon };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * POST /api/coupons/:code/validate
 * Validate a coupon without applying it
 */
export async function validateCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN or BILLING_ADMIN required' };
    }

    const orgId = getOrgId(request);
    const { code } = request.params as { code: string };
    const body = applyCouponSchema.parse(request.body);
    const userId = getUserId(request);

    const input = {
      code,
      orgId,
      userId: body.userId ?? userId,
      purchaseAmount: body.purchaseAmount ?? 0,
    };

    const result = await validateCoupon(input);

    if (!result.valid) {
      reply.code(400);
      return {
        success: false,
        error: 'Invalid coupon',
        message: result.reason,
        coupon: result.coupon,
      };
    }

    return {
      success: true,
      valid: true,
      coupon: result.coupon,
      discountAmount: result.discountAmount,
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400);
      return { success: false, error: 'Invalid input', details: error.format() };
    }
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * POST /api/coupons/:code/apply
 * Apply coupon to a purchase, record usage
 */
export async function applyCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN or BILLING_ADMIN required' };
    }

    const orgId = getOrgId(request);
    const { code } = request.params as { code: string };
    const body = applyCouponSchema.parse(request.body);
    const userId = getUserId(request);

    const input = {
      code,
      orgId,
      userId: body.userId ?? userId,
      purchaseAmount: body.purchaseAmount,
      orderId: body.orderId,
    };

    const result = await applyCoupon(input);

    if (!result.success) {
      reply.code(400);
      return {
        success: false,
        error: 'Failed to apply coupon',
        message: result.message,
        coupon: result.coupon,
      };
    }

    return {
      success: true,
      data: {
        coupon: result.coupon,
        discountAmount: result.discountAmount,
        remainingUses: result.remainingUses,
        remainingPerUser: result.remainingPerUser,
      },
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400);
      return { success: false, error: 'Invalid input', details: error.format() };
    }
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * DELETE /api/coupons/:code
 * Deactivate a coupon
 */
export async function deactivateCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN or BILLING_ADMIN required' };
    }

    const { code } = request.params as { code: string };
    const orgId = getOrgId(request);

    const coupon = await deactivateCoupon(code, orgId);

    return { success: true, data: coupon, message: 'Coupon deactivated' };
  } catch (error: any) {
    if (error.message === 'Coupon not found') {
      reply.code(404);
      return { success: false, error: 'Coupon not found' };
    }
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /api/coupons/:code/usage
 * Get usage statistics for a coupon
 */
export async function getUsageHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOrgAdmin(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: ORG_ADMIN or BILLING_ADMIN required' };
    }

    const { code } = request.params as { code: string };
    const orgId = getOrgId(request);

    const stats = await getCouponUsageStats(code, orgId);
    if (!stats) {
      reply.code(404);
      return { success: false, error: 'Coupon not found' };
    }

    return { success: true, data: stats };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerCouponRoutes(app: any, options: { prefix?: string } = {}) {
  const prefix = options.prefix || '/api/coupons';

  // Use feature check middleware on all routes
  app.post('/', { preHandler: requireFeature('coupons_enabled') }, createCouponHandler);
  app.get('/', { preHandler: requireFeature('coupons_enabled') }, listCouponsHandler);
  app.get('/:code', { preHandler: requireFeature('coupons_enabled') }, getCouponHandler);
  app.post('/:code/validate', { preHandler: requireFeature('coupons_enabled') }, validateCouponHandler);
  app.post('/:code/apply', { preHandler: requireFeature('coupons_enabled') }, applyCouponHandler);
  app.delete('/:code', { preHandler: requireFeature('coupons_enabled') }, deactivateCouponHandler);
  app.get('/:code/usage', { preHandler: requireFeature('coupons_enabled') }, getUsageHandler);
}
