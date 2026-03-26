/**
 * Coupon & Discount System Service
 * Provides coupon creation, validation, and application functionality
 */

import { prisma } from '../prisma';
import type {
  Coupon,
  CouponUsage,
  CreateCouponInput,
  ValidateCouponInput,
  ValidateCouponResult,
  ApplyCouponInput,
  ApplyCouponResult,
  CouponFilters,
  CouponUsageStats,
} from './types';

/**
 * Create a new coupon
 */
export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  // Validate discount value based on type
  if (input.discountType === 'percentage') {
    if (input.discountValue <= 0 || input.discountValue > 100) {
      throw new Error('Percentage discount must be between 0 and 100');
    }
  } else if (input.discountType === 'fixed') {
    if (input.discountValue <= 0) {
      throw new Error('Fixed discount must be greater than 0');
    }
  }

  // Validate date range
  if (input.validFrom >= input.validTo) {
    throw new Error('validFrom must be before validTo');
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: input.code.toUpperCase(), // Standardize to uppercase
      name: input.name,
      description: input.description,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxUses: input.maxUses ?? null,
      perUserLimit: input.perUserLimit ?? null,
      minPurchaseAmount: input.minPurchaseAmount ?? null,
      validFrom: input.validFrom,
      validTo: input.validTo,
      orgId: input.orgId,
      createdBy: input.createdBy,
      isActive: true,
    },
  });

  return coupon;
}

/**
 * Get a coupon by code (optionally filtered by orgId)
 */
export async function getCoupon(code: string, orgId?: string): Promise<Coupon | null> {
  const where: { code: string; orgId?: string } = { code: code.toUpperCase() };
  if (orgId) {
    where.orgId = orgId;
  }

  const coupon = await prisma.coupon.findUnique({
    where,
  });

  return coupon;
}

/**
 * List coupons for an organization with optional filters
 */
export async function listCoupons(filters: CouponFilters): Promise<{ coupons: Coupon[]; total: number }> {
  const where: any = { orgId: filters.orgId };

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }
  if (filters.code) {
    where.code = { contains: filters.code.toUpperCase() };
  }

  const [coupons, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: filters.offset ?? 0,
      take: filters.limit ?? 50,
    }),
    prisma.coupon.count({ where }),
  ]);

  return { coupons, total };
}

/**
 * Validate if a coupon is usable without consuming it
 */
export async function validateCoupon(
  input: ValidateCouponInput
): Promise<ValidateCouponResult> {
  const coupon = await getCoupon(input.code, input.orgId);

  if (!coupon) {
    return { valid: false, coupon: null, discountAmount: 0, reason: 'Coupon not found' };
  }

  // Check if active
  if (!coupon.isActive) {
    return { valid: false, coupon, discountAmount: 0, reason: 'Coupon is inactive' };
  }

  // Check date range
  const now = new Date();
  if (now < coupon.validFrom) {
    return { valid: false, coupon, discountAmount: 0, reason: 'Coupon not yet valid' };
  }
  if (now > coupon.validTo) {
    return { valid: false, coupon, discountAmount: 0, reason: 'Coupon has expired' };
  }

  // Check overall usage limit
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, coupon, discountAmount: 0, reason: 'Coupon usage limit reached' };
  }

  // Check per-user limit if userId provided
  if (input.userId && coupon.perUserLimit !== null) {
    const userUsageCount = await prisma.couponUsage.count({
      where: {
        couponId: coupon.id,
        orgId: input.orgId,
        userId: input.userId,
      },
    });

    if (userUsageCount >= coupon.perUserLimit) {
      return {
        valid: false,
        coupon,
        discountAmount: 0,
        reason: 'Per-user usage limit reached',
      };
    }
  }

  // Check minimum purchase amount
  if (coupon.minPurchaseAmount !== null && input.purchaseAmount < coupon.minPurchaseAmount) {
    return {
      valid: false,
      coupon,
      discountAmount: 0,
      reason: `Minimum purchase amount of ${coupon.minPurchaseAmount} required`,
    };
  }

  // Calculate discount
  const discountAmount = calculateDiscount(coupon.discountType, coupon.discountValue, input.purchaseAmount);

  return { valid: true, coupon, discountAmount };
}

/**
 * Apply a coupon to a purchase, recording usage
 */
export async function applyCoupon(input: ApplyCouponInput): Promise<ApplyCouponResult> {
  // First validate the coupon
  const validation = await validateCoupon({
    code: input.code,
    orgId: input.orgId,
    userId: input.userId,
    purchaseAmount: input.purchaseAmount,
  });

  if (!validation.valid || !validation.coupon) {
    return {
      success: false,
      coupon: validation.coupon ?? null,
      discountAmount: 0,
      remainingUses: null,
      remainingPerUser: null,
      message: validation.reason || 'Invalid coupon',
    };
  }

  const coupon = validation.coupon;

  // Check if this is the same order already using this coupon (idempotency)
  if (input.orderId) {
    const existingUsage = await prisma.couponUsage.findFirst({
      where: {
        couponId: coupon.id,
        orgId: input.orgId,
        orderId: input.orderId,
      },
    });

    if (existingUsage) {
      // Already applied to this order, return same result (idempotent)
      return {
        success: true,
        coupon,
        discountAmount: validation.discountAmount,
        remainingUses: coupon.maxUses ? coupon.maxUses - coupon.usedCount : null,
        remainingPerUser: input.userId && coupon.perUserLimit
          ? coupon.perUserLimit - await prisma.couponUsage.count({
              where: { couponId: coupon.id, orgId: input.orgId, userId: input.userId },
            })
          : null,
        message: 'Coupon already applied to this order',
      };
    }
  }

  // Record usage in a transaction
  await prisma.$transaction(async (tx) => {
    // Create usage record
    await tx.couponUsage.create({
      data: {
        couponId: coupon.id,
        orgId: input.orgId,
        userId: input.userId ?? null,
        orderId: input.orderId ?? null,
      },
    });

    // Increment usedCount on coupon
    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
  });

  // Calculate remaining limits
  const remainingUses = coupon.maxUses ? coupon.maxUses - (coupon.usedCount + 1) : null;
  let remainingPerUser: number | null = null;
  if (input.userId && coupon.perUserLimit !== null) {
    const perUserCount = await prisma.couponUsage.count({
      where: {
        couponId: coupon.id,
        orgId: input.orgId,
        userId: input.userId,
      },
    });
    remainingPerUser = coupon.perUserLimit - perUserCount;
  }

  return {
    success: true,
    coupon,
    discountAmount: validation.discountAmount,
    remainingUses,
    remainingPerUser,
    message: 'Coupon applied successfully',
  };
}

/**
 * Deactivate a coupon (soft delete)
 */
export async function deactivateCoupon(code: string, orgId: string): Promise<Coupon> {
  const coupon = await prisma.coupon.findFirst({
    where: { code: code.toUpperCase(), orgId },
  });

  if (!coupon) {
    throw new Error('Coupon not found');
  }

  const updated = await prisma.coupon.update({
    where: { id: coupon.id },
    data: { isActive: false },
  });

  return updated;
}

/**
 * Get usage statistics for a coupon
 */
export async function getCouponUsageStats(
  code: string,
  orgId: string
): Promise<CouponUsageStats | null> {
  const coupon = await getCoupon(code, orgId);
  if (!coupon) {
    return null;
  }

  const [totalUses, perUserUsage, recentUsage] = await Promise.all([
    prisma.couponUsage.count({
      where: { couponId: coupon.id },
    }),
    // Note: for per-user breakdown, caller would specify userId
    // Here we just return 0 if not tracked for this user
    0,
    prisma.couponUsage.findMany({
      where: { couponId: coupon.id },
      orderBy: { usedAt: 'desc' },
      take: 10,
    }),
  ]);

  return {
    totalUses,
    perUserUsage: 0,
    recentUsage,
  };
}

/**
 * Helper: Calculate discount amount
 */
function calculateDiscount(type: string, value: number, purchaseAmount: number): number {
  if (type === 'percentage') {
    // value is percentage (0-100)
    return Math.round(purchaseAmount * (value / 100) * 100) / 100; // Round to 2 decimals
  } else {
    // fixed amount, but cannot exceed purchase amount
    return Math.min(value, purchaseAmount);
  }
}

/**
 * Batch validation: check multiple coupons at once
 */
export async function validateCouponsBatch(
  orgId: string,
  codes: string[],
  purchaseAmount: number,
  userId?: string
): Promise<Map<string, ValidateCouponResult>> {
  const results = new Map<string, ValidateCouponResult>();

  for (const code of codes) {
    const result = await validateCoupon({
      code,
      orgId,
      userId,
      purchaseAmount,
    });
    results.set(code.toUpperCase(), result);
  }

  return results;
}

/**
 * Initialize or seed default coupons (for testing/demo)
 */
export async function initializeDefaultCoupons(orgId: string): Promise<void> {
  const existingCount = await prisma.coupon.count({ where: { orgId } });
  if (existingCount > 0) {
    return; // Skip if coupons already exist
  }

  const now = new Date();
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setMonth(now.getMonth() + 1);

  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME10',
        name: 'Welcome Discount',
        description: '10% off for new customers',
        discountType: 'percentage',
        discountValue: 10,
        validFrom: now,
        validTo: oneMonthFromNow,
        orgId,
        createdBy: 'system',
        isActive: true,
      },
      {
        code: 'SAVE20',
        name: '$20 Off',
        description: '$20 discount on orders over $100',
        discountType: 'fixed',
        discountValue: 20,
        minPurchaseAmount: 100,
        validFrom: now,
        validTo: oneMonthFromNow,
        orgId,
        createdBy: 'system',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });
}
