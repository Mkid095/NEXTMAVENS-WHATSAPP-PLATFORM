/**
 * Type definitions for Coupon & Discount System
 */

export type DiscountType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number; // Decimal from DB, represents percentage (0-100) or fixed amount
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number | null;
  minPurchaseAmount: number | null;
  validFrom: Date;
  validTo: Date;
  orgId: string;
  createdBy: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponUsage {
  id: string;
  couponId: string;
  orgId: string;
  userId: string | null;
  usedAt: Date;
  orderId: string | null;
}

export interface CreateCouponInput {
  code: string;
  name: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses?: number;
  perUserLimit?: number;
  minPurchaseAmount?: number;
  validFrom: Date;
  validTo: Date;
  orgId: string;
  createdBy: string;
}

export interface ValidateCouponInput {
  code: string;
  orgId: string;
  userId?: string;
  purchaseAmount: number; // in currency units (e.g., dollars)
}

export interface ValidateCouponResult {
  valid: boolean;
  coupon: Coupon | null;
  discountAmount: number; // calculated discount in currency units
  reason?: string; // explanation if not valid
}

export interface ApplyCouponInput {
  code: string;
  orgId: string;
  userId?: string;
  purchaseAmount: number;
  orderId?: string;
}

export interface ApplyCouponResult {
  success: boolean;
  coupon: Coupon | null;
  discountAmount: number;
  remainingUses: number | null;
  remainingPerUser: number | null;
  message?: string;
}

export interface CouponFilters {
  orgId: string;
  isActive?: boolean;
  code?: string;
  limit?: number;
  offset?: number;
}

export interface CouponUsageStats {
  totalUses: number;
  perUserUsage: number;
  recentUsage: CouponUsage[];
}
