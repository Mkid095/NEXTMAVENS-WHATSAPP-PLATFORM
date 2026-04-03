/**
 * Coupon Application Operations
 * Apply coupons to orders and record usage
 */

import { prisma } from '../prisma';
import type {
  ApplyCouponInput,
  ApplyCouponResult,
  CouponUsageStats,
  Coupon,
} from './types';
import { validateCoupon } from './coupon.validation';
import { getCoupon } from './coupon.management';

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

  const [totalUses, , recentUsage] = await Promise.all([
    prisma.couponUsage.count({
      where: { couponId: coupon.id },
    }),
    // Note: for per-user breakdown, caller would specify userId
    // Here we just return 0 if not tracked for this user
    Promise.resolve(0),
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
