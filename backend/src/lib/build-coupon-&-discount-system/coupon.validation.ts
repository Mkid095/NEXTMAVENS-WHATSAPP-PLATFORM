/**
 * Coupon Validation Operations
 * Validate coupons without consuming usage
 */

import { prisma } from '../prisma';
import type {
  ValidateCouponInput,
  ValidateCouponResult,
  Coupon,
} from './types';
import { getCoupon } from './coupon.management';

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
