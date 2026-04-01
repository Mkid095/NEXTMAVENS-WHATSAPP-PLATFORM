/**
 * Coupon Management Operations
 * Create, read, update (deactivate) coupons
 */

import { prisma } from '../prisma';
import type {
  Coupon,
  CreateCouponInput,
  CouponFilters,
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
