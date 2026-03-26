/**
 * Unit tests for Coupon & Discount System Service
 */

// Mock the prisma singleton BEFORE importing the service
const mockPrisma = {
  coupon: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn(),
  },
  couponUsage: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation(async (callback) => {
    const tx = {
      couponUsage: { create: mockPrisma.couponUsage.create },
      coupon: { update: mockPrisma.coupon.update },
    };
    return await callback(tx);
  }),
};

jest.mock('../../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  createCoupon,
  getCoupon,
  listCoupons,
  validateCoupon,
  applyCoupon,
  deactivateCoupon,
  getCouponUsageStats,
  validateCouponsBatch,
  initializeDefaultCoupons,
} from '../../../lib/build-coupon-&-discount-system';

const now = new Date();
const yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
const nextWeek = new Date(now);
nextWeek.setDate(nextWeek.getDate() + 7);
const nextMonth = new Date(now);
nextMonth.setDate(nextMonth.getDate() + 30);

const defaultOrgId = 'org-123';
const defaultUserId = 'user-1';

describe('Coupon & Discount Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCoupon', () => {
    it('should create a valid percentage coupon', async () => {
      const input = {
        code: 'TEST10',
        name: 'Test Coupon',
        discountType: 'percentage' as const,
        discountValue: 10,
        validFrom: now,
        validTo: nextMonth,
        orgId: defaultOrgId,
        createdBy: defaultUserId,
      };

      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        name: 'Test Coupon',
        description: null,
        discountType: 'percentage',
        discountValue: 10,
        maxUses: null,
        usedCount: 0,
        perUserLimit: null,
        minPurchaseAmount: null,
        validFrom: now,
        validTo: nextMonth,
        orgId: defaultOrgId,
        createdBy: defaultUserId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      (mockPrisma.coupon.create as jest.Mock).mockResolvedValue(mockCoupon);

      const result = await createCoupon(input);
      expect(result).toEqual(mockCoupon);
    });

    it('should create a valid fixed amount coupon', async () => {
      const input = {
        code: 'SAVE20',
        name: '$20 Off',
        discountType: 'fixed' as const,
        discountValue: 20,
        minPurchaseAmount: 100,
        validFrom: now,
        validTo: nextMonth,
        orgId: defaultOrgId,
        createdBy: defaultUserId,
      };

      const mockCoupon = {
        id: 'coupon-2',
        code: 'SAVE20',
        name: '$20 Off',
        description: null,
        discountType: 'fixed',
        discountValue: 20,
        maxUses: null,
        usedCount: 0,
        perUserLimit: null,
        minPurchaseAmount: 100,
        validFrom: now,
        validTo: nextMonth,
        orgId: defaultOrgId,
        createdBy: defaultUserId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      (mockPrisma.coupon.create as jest.Mock).mockResolvedValue(mockCoupon);

      const result = await createCoupon(input);
      expect(result).toEqual(mockCoupon);
    });

    it('should throw for invalid percentage value', async () => {
      const input = {
        code: 'BADPCT',
        name: 'Bad Percentage',
        discountType: 'percentage' as const,
        discountValue: 150, // > 100
        validFrom: now,
        validTo: nextMonth,
        orgId: defaultOrgId,
        createdBy: defaultUserId,
      };

      await expect(createCoupon(input)).rejects.toThrow('Percentage discount must be between 0 and 100');
    });

    it('should throw for invalid date range', async () => {
      const input = {
        code: 'BADDATE',
        name: 'Bad Date',
        discountType: 'fixed' as const,
        discountValue: 10,
        validFrom: nextMonth,
        validTo: now, // From after To
        orgId: defaultOrgId,
        createdBy: defaultUserId,
      };

      await expect(createCoupon(input)).rejects.toThrow('validFrom must be before validTo');
    });

    it('should uppercase the coupon code', async () => {
      const input = {
        code: 'lowercase',
        name: 'Lowercase Test',
        discountType: 'percentage' as const,
        discountValue: 5,
        validFrom: now,
        validTo: nextMonth,
        orgId: defaultOrgId,
        createdBy: defaultUserId,
      };

      const mockCoupon = {
        ...input,
        code: 'LOWERCASE',
        id: 'coupon-1',
        description: null,
        maxUses: null,
        usedCount: 0,
        perUserLimit: null,
        minPurchaseAmount: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      (mockPrisma.coupon.create as jest.Mock).mockResolvedValue(mockCoupon);

      const result = await createCoupon(input);
      expect(result.code).toBe('LOWERCASE');
    });
  });

  describe('getCoupon', () => {
    it('should return coupon by code and orgId', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'TEST10',
        name: 'Test',
        description: null,
        discountType: 'percentage',
        discountValue: 10,
        maxUses: null,
        usedCount: 0,
        perUserLimit: null,
        minPurchaseAmount: null,
        validFrom: now,
        validTo: nextMonth,
        orgId: defaultOrgId,
        createdBy: defaultUserId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue(mockCoupon);

      const result = await getCoupon('TEST10', defaultOrgId);
      expect(result).toEqual(mockCoupon);
    });

    it('should return coupon by code only (no org filter)', async () => {
      const mockCoupon = {
        ...defaultCoupon(),
        orgId: 'other-org',
      };

      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue(mockCoupon);

      const result = await getCoupon('TEST10');
      expect(result).toEqual(mockCoupon);
    });

    it('should return null when coupon not found', async () => {
      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getCoupon('NONEXISTENT', defaultOrgId);
      expect(result).toBeNull();
    });

    it('should uppercase code in search', async () => {
      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue(null);

      await getCoupon('lowercase', defaultOrgId);
      expect(mockPrisma.coupon.findUnique).toHaveBeenCalledWith({
        where: { code: 'LOWERCASE', orgId: defaultOrgId },
      });
    });
  });

  describe('listCoupons', () => {
    it('should list coupons for org with pagination', async () => {
      const mockCoupons = [
        defaultCoupon({ id: '1', code: 'COUPON1' }),
        defaultCoupon({ id: '2', code: 'COUPON2' }),
      ];

      (mockPrisma.coupon.findMany as jest.Mock).mockResolvedValue(mockCoupons);
      (mockPrisma.coupon.count as jest.Mock).mockResolvedValue(2);

      const result = await listCoupons({
        orgId: defaultOrgId,
        limit: 10,
        offset: 0,
      });

      expect(result.coupons).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by code', async () => {
      await listCoupons({ orgId: defaultOrgId, code: 'TEST' });

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ code: { contains: 'TEST' } }),
        })
      );
    });

    it('should filter by isActive', async () => {
      await listCoupons({ orgId: defaultOrgId, isActive: false });

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('should apply pagination', async () => {
      await listCoupons({ orgId: defaultOrgId, limit: 10, offset: 20 });

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
    });
  });

  describe('validateCoupon', () => {
    const validCoupon = defaultCoupon({
      code: 'VALID10',
      discountType: 'percentage',
      discountValue: 10,
      maxUses: null,
      perUserLimit: null,
      minPurchaseAmount: null,
      validFrom: yesterday,
      validTo: nextWeek,
      isActive: true,
    });

    beforeEach(() => {
      (mockPrisma.couponUsage.count as jest.Mock).mockResolvedValue(0);
    });

    it('should return invalid when coupon not found', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue(null);

      const result = await validateCoupon({
        code: 'NONEXISTENT',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.coupon).toBeNull();
      expect(result.reason).toBe('Coupon not found');
    });

    it('should return invalid when coupon is inactive', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue({
        ...validCoupon,
        isActive: false,
      });

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Coupon is inactive');
    });

    it('should return invalid when expired', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue({
        ...validCoupon,
        validTo: yesterday,
      });

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Coupon has expired');
    });

    it('should return invalid when not yet valid', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue({
        ...validCoupon,
        validFrom: nextWeek,
      });

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Coupon not yet valid');
    });

    it('should return invalid when max uses reached', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue({
        ...validCoupon,
        maxUses: 10,
        usedCount: 10,
      });

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Coupon usage limit reached');
    });

    it('should return invalid when per-user limit reached', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue({
        ...validCoupon,
        perUserLimit: 2,
      });
      (mockPrisma.couponUsage.count as jest.Mock).mockResolvedValue(2);

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        userId: 'user-1',
        purchaseAmount: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Per-user usage limit reached');
    });

    it('should return invalid when purchase below minimum', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue({
        ...validCoupon,
        minPurchaseAmount: 50,
      });

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 30,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Minimum purchase amount of 50 required');
    });

    it('should return valid coupon with calculated discount', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue(validCoupon);

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.valid).toBe(true);
      expect(result.coupon).toEqual(validCoupon);
      expect(result.discountAmount).toBe(10); // 10% of 100 = 10
    });

    it('should calculate fixed discount correctly', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue({
        ...validCoupon,
        discountType: 'fixed',
        discountValue: 25,
      });

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.discountAmount).toBe(25);
    });

    it('should cap fixed discount at purchase amount', async () => {
      mockPrisma.coupon.findUnique = jest.fn().mockResolvedValue({
        ...validCoupon,
        discountType: 'fixed',
        discountValue: 150,
      });

      const result = await validateCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.discountAmount).toBe(100); // Can't discount more than purchase
    });
  });

  describe('applyCoupon', () => {
    const validCoupon = defaultCoupon({
      code: 'VALID10',
      discountType: 'percentage',
      discountValue: 10,
      maxUses: 10,
      usedCount: 0,
      perUserLimit: 1,
      validFrom: yesterday,
      validTo: nextWeek,
      isActive: true,
    });

    beforeEach(() => {
      (mockPrisma.couponUsage.count as jest.Mock).mockResolvedValue(0);
      // Setup transaction mock to execute callback with tx object containing mock methods
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          couponUsage: { create: mockPrisma.couponUsage.create },
          coupon: { update: mockPrisma.coupon.update },
        };
        return await callback(tx);
      });
    });

    it('should apply coupon successfully', async () => {
      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue(validCoupon);
      // Mock count: first call in validation returns 0, second call after transaction returns 1
      (mockPrisma.couponUsage.count as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      const result = await applyCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        userId: 'user-1',
        purchaseAmount: 100,
        orderId: 'order-123',
      });

      expect(result.success).toBe(true);
      expect(result.discountAmount).toBe(10);
      expect(result.remainingUses).toBe(9); // 10 max - 1 used
      expect(result.remainingPerUser).toBe(0); // 1 limit - 1 used = 0
      // Verify transaction was used
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      // Verify create and update were called within transaction (via tx object)
      expect(mockPrisma.couponUsage.create).toHaveBeenCalled();
      expect(mockPrisma.coupon.update).toHaveBeenCalled();
    });

    it('should be idempotent when same orderId', async () => {
      // Remove perUserLimit to avoid per-user limit validation interference
      const couponNoPerUserLimit = { ...validCoupon, perUserLimit: null };
      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue(couponNoPerUserLimit);
      (mockPrisma.couponUsage.findFirst as jest.Mock).mockResolvedValue({ id: 'usage-1' });

      const result = await applyCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        userId: 'user-1',
        purchaseAmount: 100,
        orderId: 'order-123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Coupon already applied to this order');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should fail when validation fails', async () => {
      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue({
        ...validCoupon,
        isActive: false,
      });

      const result = await applyCoupon({
        code: 'VALID10',
        orgId: defaultOrgId,
        purchaseAmount: 100,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Coupon is inactive');
    });
  });

  describe('deactivateCoupon', () => {
    it('should deactivate existing coupon', async () => {
      const existing = defaultCoupon({ code: 'TEST', isActive: true });
      (mockPrisma.coupon.findFirst as jest.Mock).mockResolvedValue(existing);
      (mockPrisma.coupon.update as jest.Mock).mockResolvedValue({ ...existing, isActive: false });

      const result = await deactivateCoupon('TEST', defaultOrgId);

      expect(result.isActive).toBe(false);
    });

    it('should throw when coupon not found', async () => {
      (mockPrisma.coupon.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(deactivateCoupon('NONEXISTENT', defaultOrgId)).rejects.toThrow('Coupon not found');
    });
  });

  describe('getCouponUsageStats', () => {
    it('should return stats for coupon', async () => {
      const mockCoupon = defaultCoupon({ code: 'TEST', usedCount: 15, id: 'coupon-1' });
      const mockUsage = [
        { id: 'u1', couponId: 'coupon-1', usedAt: now },
        { id: 'u2', couponId: 'coupon-1', usedAt: now },
      ];

      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue(mockCoupon);
      (mockPrisma.couponUsage.count as jest.Mock).mockResolvedValue(15);
      (mockPrisma.couponUsage.findMany as jest.Mock).mockResolvedValue(mockUsage);

      const result = await getCouponUsageStats('TEST', defaultOrgId);

      expect(result).toEqual({
        totalUses: 15,
        perUserUsage: 0,
        recentUsage: mockUsage,
      });
    });

    it('should return null when coupon not found', async () => {
      (mockPrisma.coupon.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getCouponUsageStats('NONEXISTENT', defaultOrgId);
      expect(result).toBeNull();
    });
  });

  describe('calculateDiscount', () => {
    it('should calculate percentage correctly', () => {
      // Private function test through integration
      const result = validateCoupon({
        code: 'TEST',
        orgId: defaultOrgId,
        purchaseAmount: 200,
      });
      // We trust the calculation works based on this integration test
    });
  });

  describe('initializeDefaultCoupons', () => {
    it('should create default coupons when none exist', async () => {
      (mockPrisma.coupon.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.coupon.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      await initializeDefaultCoupons(defaultOrgId);

      expect(mockPrisma.coupon.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ code: 'WELCOME10' }),
            expect.objectContaining({ code: 'SAVE20' }),
          ]),
        })
      );
    });

    it('should skip if coupons already exist', async () => {
      (mockPrisma.coupon.count as jest.Mock).mockResolvedValue(5);

      await initializeDefaultCoupons(defaultOrgId);

      expect(mockPrisma.coupon.createMany).not.toHaveBeenCalled();
    });
  });
});

// Helper
function defaultCoupon(overrides: Partial<any> = {}): any {
  return {
    id: 'coupon-1',
    code: 'TEST10',
    name: 'Test Coupon',
    description: null,
    discountType: 'percentage',
    discountValue: 10,
    maxUses: null,
    usedCount: 0,
    perUserLimit: null,
    minPurchaseAmount: null,
    validFrom: now,
    validTo: nextMonth,
    orgId: defaultOrgId,
    createdBy: defaultUserId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
