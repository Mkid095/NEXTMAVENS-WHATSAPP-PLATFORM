/**
 * Integration tests for Coupon & Discount API
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Mock coupon service
jest.mock('../../../../lib/build-coupon-&-discount-system', () => ({
  createCoupon: jest.fn(),
  getCoupon: jest.fn(),
  listCoupons: jest.fn(),
  validateCoupon: jest.fn(),
  applyCoupon: jest.fn(),
  deactivateCoupon: jest.fn(),
  getCouponUsageStats: jest.fn(),
  initializeDefaultCoupons: jest.fn(),
}));

// Mock feature management
jest.mock('../../../../lib/feature-management', () => ({
  checkFeatureAccess: jest.fn(),
}));

import {
  createCoupon,
  getCoupon,
  listCoupons,
  validateCoupon,
  applyCoupon,
  deactivateCoupon,
  getCouponUsageStats,
} from '../../../../lib/build-coupon-&-discount-system';

import { checkFeatureAccess } from '../../../../lib/feature-management';

const mockService = {
  createCoupon: createCoupon as jest.Mock,
  getCoupon: getCoupon as jest.Mock,
  listCoupons: listCoupons as jest.Mock,
  validateCoupon: validateCoupon as jest.Mock,
  applyCoupon: applyCoupon as jest.Mock,
  deactivateCoupon: deactivateCoupon as jest.Mock,
  getCouponUsageStats: getCouponUsageStats as jest.Mock,
};

const mockCheckFeatureAccess = checkFeatureAccess as jest.Mock;

const mockOrgId = 'org-123';
const mockUserId = 'user-1';
const now = new Date();
const nextWeek = new Date(now);
nextWeek.setDate(nextWeek.getDate() + 7);

describe('Coupon & Discount API', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    jest.clearAllMocks();

    // Mock feature check to return enabled by default
    mockCheckFeatureAccess.mockResolvedValue({ enabled: true, reason: 'global' });

    // Auth hook - mimics orgGuard, requires ORG_ADMIN or BILLING_ADMIN
    fastify.addHook('preHandler', async (request, reply) => {
      const role = (request.headers['x-user-role'] as string) || 'USER';
      const orgId = (request.headers['x-org-id'] as string) || '';
      const userId = (request.headers['x-user-id'] as string);

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      if (role !== 'ORG_ADMIN' && role !== 'BILLING_ADMIN') {
        reply.code(403).send({ error: 'Forbidden' });
        return;
      }

      (request as any).user = { role, orgId, userId };
    });

    // Import and register routes
    const routes = await import('../../../../app/api/build-coupon-&-discount-system/route');
    await fastify.register((routes.default || routes).registerCouponRoutes, { prefix: '/api/coupons' });
  });

  describe('POST /api/coupons', () => {
    it('should create a new coupon', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'WELCOME10',
        name: 'Welcome 10%',
        description: '10% off',
        discountType: 'percentage',
        discountValue: 10,
        maxUses: 100,
        usedCount: 0,
        perUserLimit: 1,
        minPurchaseAmount: null,
        validFrom: new Date(),
        validTo: new Date(),
        orgId: mockOrgId,
        createdBy: mockUserId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockService.createCoupon.mockResolvedValue(mockCoupon);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: {
          code: 'WELCOME10',
          name: 'Welcome 10%',
          discountType: 'percentage',
          discountValue: 10,
          maxUses: 100,
          perUserLimit: 1,
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.code).toBe('WELCOME10');
    });

    it('should uppercase coupon code', async () => {
      mockService.createCoupon.mockResolvedValue({
        id: '1',
        code: 'WELCOME10',
        name: 'Test',
        discountType: 'percentage',
        discountValue: 10,
        validFrom: new Date(),
        validTo: new Date(),
        orgId: mockOrgId,
        createdBy: mockUserId,
        isActive: true,
        usedCount: 0,
        maxUses: null,
        perUserLimit: null,
        minPurchaseAmount: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await fastify.inject({
        method: 'POST',
        url: '/api/coupons',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: {
          code: 'welcome10',
          name: 'Test',
          discountType: 'percentage',
          discountValue: 10,
          validFrom: new Date().toISOString(),
          validTo: new Date().toISOString(),
        },
      });

      expect(mockService.createCoupon).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'welcome10' })
      );
    });

    it('should reject invalid discount value', async () => {
      mockService.createCoupon.mockRejectedValue(
        new Error('Percentage discount must be between 0 and 100')
      );

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: {
          code: 'BAD',
          name: 'Bad',
          discountType: 'percentage',
          discountValue: 150,
          validFrom: new Date().toISOString(),
          validTo: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should reject duplicate coupon code', async () => {
      mockService.createCoupon.mockRejectedValue(
        new Error('duplicate key value violates unique constraint "coupons_code_key"')
      );

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: {
          code: 'EXISTING',
          name: 'Test',
          discountType: 'fixed',
          discountValue: 10,
          validFrom: new Date().toISOString(),
          validTo: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(409);
    });

    it('should require ORG_ADMIN or BILLING_ADMIN', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons',
        headers: {
          'x-user-role': 'AGENT',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: {
          code: 'TEST',
          name: 'Test',
          discountType: 'percentage',
          discountValue: 10,
          validFrom: new Date().toISOString(),
          validTo: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/coupons', () => {
    it('should list coupons for org', async () => {
      const mockCoupons = [
        {
          id: '1',
          code: 'COUPON1',
          name: 'Test 1',
          discountType: 'percentage',
          discountValue: 10,
          usedCount: 0,
          isActive: true,
        },
        {
          id: '2',
          code: 'COUPON2',
          name: 'Test 2',
          discountType: 'fixed',
          discountValue: 20,
          usedCount: 5,
          isActive: true,
        },
      ];
      mockService.listCoupons.mockResolvedValue({ coupons: mockCoupons, total: 2 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/coupons',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('should filter by code', async () => {
      await fastify.inject({
        method: 'GET',
        url: '/api/coupons?code=TEST',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(mockService.listCoupons).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'TEST' })
      );
    });
  });

  describe('GET /api/coupons/:code', () => {
    it('should get coupon details', async () => {
      const mockCoupon = {
        id: '1',
        code: 'SINGLE',
        name: 'Single Test',
        discountType: 'percentage',
        discountValue: 15,
        maxUses: null,
        usedCount: 0,
        perUserLimit: null,
        minPurchaseAmount: null,
        validFrom: now,
        validTo: nextWeek,
        orgId: mockOrgId,
        createdBy: mockUserId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      mockService.getCoupon.mockResolvedValue(mockCoupon);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/coupons/SINGLE',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.code).toBe('SINGLE');
    });

    it('should return 404 when not found', async () => {
      mockService.getCoupon.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/coupons/NONEXISTENT',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/coupons/:code/validate', () => {
    it('should validate coupon successfully', async () => {
      mockService.validateCoupon.mockResolvedValue({
        valid: true,
        coupon: defaultCoupon(),
        discountAmount: 25,
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons/VALID/validate',
        headers: {
          'x-user-role': 'ORG_ADMIN', // Now require admin
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: { purchaseAmount: 100 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.valid).toBe(true);
      expect(body.discountAmount).toBe(25);
    });

    it('should reject invalid coupon with 400', async () => {
      mockService.validateCoupon.mockResolvedValue({
        valid: false,
        coupon: null,
        discountAmount: 0,
        reason: 'Coupon expired',
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons/EXPIRED/validate',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: { purchaseAmount: 100 },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Coupon expired');
    });

    it('should reject AGENT role for validate', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons/TEST/validate',
        headers: {
          'x-user-role': 'AGENT',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: { purchaseAmount: 100 },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /api/coupons/:code/apply', () => {
    it('should apply coupon successfully', async () => {
      mockService.applyCoupon.mockResolvedValue({
        success: true,
        coupon: defaultCoupon(),
        discountAmount: 20,
        remainingUses: 9,
        remainingPerUser: 0,
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons/SAVE20/apply',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: { purchaseAmount: 200, orderId: 'order-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.discountAmount).toBe(20);
    });

    it('should fail when validation fails', async () => {
      mockService.applyCoupon.mockResolvedValue({
        success: false,
        coupon: null,
        discountAmount: 0,
        message: 'Coupon expired',
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/coupons/EXPIRED/apply',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
        body: { purchaseAmount: 100 },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Coupon expired');
    });
  });

  describe('DELETE /api/coupons/:code', () => {
    it('should deactivate coupon', async () => {
      mockService.deactivateCoupon.mockResolvedValue({
        ...defaultCoupon(),
        isActive: false,
      });

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/coupons/DEACTIVATE',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.isActive).toBe(false);
    });

    it('should return 404 when coupon not found', async () => {
      mockService.deactivateCoupon.mockRejectedValue(new Error('Coupon not found'));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/coupons/NOTFOUND',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require admin role', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/coupons/TEST',
        headers: {
          'x-user-role': 'AGENT',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/coupons/:code/usage', () => {
    it('should get usage stats', async () => {
      mockService.getCouponUsageStats.mockResolvedValue({
        totalUses: 25,
        perUserUsage: 0,
        recentUsage: [
          { id: 'u1', usedAt: new Date() },
          { id: 'u2', usedAt: new Date() },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/coupons/TEST/usage',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.totalUses).toBe(25);
    });

    it('should return 404 when coupon not found', async () => {
      mockService.getCouponUsageStats.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/coupons/NOTFOUND/usage',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

// Helper
function defaultCoupon(overrides: Partial<any> = {}): any {
  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

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
    validTo: nextWeek,
    orgId: mockOrgId,
    createdBy: mockUserId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
