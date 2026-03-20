/**
 * Integration tests for Payment Method Management API
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Mock payment method management service
jest.mock('../../../../lib/implement-card-updates-&-payment-method-management', () => ({
  addPaymentMethod: jest.fn(),
  listPaymentMethods: jest.fn(),
  setDefaultPaymentMethod: jest.fn(),
  removePaymentMethod: jest.fn(),
  getDefaultPaymentMethod: jest.fn(),
  ensurePaystackCustomer: jest.fn(),
}));

// Mock feature management service
jest.mock('../../../../lib/feature-management', () => ({
  checkFeatureAccess: jest.fn(),
}));

import {
  addPaymentMethod,
  listPaymentMethods,
  setDefaultPaymentMethod,
  removePaymentMethod,
} from '../../../../lib/implement-card-updates-&-payment-method-management';

import { checkFeatureAccess } from '../../../../lib/feature-management';

const mockService = {
  addPaymentMethod: addPaymentMethod as jest.Mock,
  listPaymentMethods: listPaymentMethods as jest.Mock,
  setDefaultPaymentMethod: setDefaultPaymentMethod as jest.Mock,
  removePaymentMethod: removePaymentMethod as jest.Mock,
};

const mockCheckFeatureAccess = checkFeatureAccess as jest.Mock;

const mockOrgId = 'org-123';

describe('Payment Method Management API', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    jest.clearAllMocks();

    // Mock checkFeatureAccess to return enabled by default
    mockCheckFeatureAccess.mockResolvedValue({ enabled: true, reason: 'global' });

    // Auth hook - mimics orgGuard, requires ORG_ADMIN
    fastify.addHook('preHandler', async (request, reply) => {
      const role = (request.headers['x-user-role'] as string) || 'USER';
      const orgId = (request.headers['x-org-id'] as string) || '';
      const userId = (request.headers['x-user-id'] as string);

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      if (role !== 'ORG_ADMIN') {
        reply.code(403).send({ error: 'Forbidden' });
        return;
      }

      (request as any).user = { role, orgId, userId };
    });

    // Import and register routes
    const routes = await import('../../../../app/api/implement-card-updates-&-payment-method-management/route');
    await fastify.register((routes.default || routes).registerPaymentMethodRoutes, { prefix: '/api/payment-methods' });
  });

  describe('POST /api/payment-methods', () => {
    it('should add a new payment method', async () => {
      const mockMethod = {
        id: 'pm-123',
        orgId: mockOrgId,
        authorizationCode: 'AUTH_abc12345',
        last4: '4242',
        brand: 'visa',
        expMonth: 12,
        expYear: 2025,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockService.addPaymentMethod.mockResolvedValue(mockMethod);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/payment-methods',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': 'user-1',
        },
        body: { authorizationCode: 'AUTH_abc12345' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.last4).toBe('4242');
    });

    it('should require authorizationCode', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/payment-methods',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': 'user-1',
        },
        body: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject non-ORG_ADMIN', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/payment-methods',
        headers: {
          'x-user-role': 'USER',
          'x-org-id': mockOrgId,
          'x-user-id': 'user-1',
        },
        body: { authorizationCode: 'AUTH_abc' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/payment-methods', () => {
    it('should list payment methods for org', async () => {
      const mockMethods = [
        {
          id: 'pm-1',
          orgId: mockOrgId,
          authorizationCode: 'AUTH1',
          last4: '1111',
          brand: 'visa',
          expMonth: 1,
          expYear: 2025,
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'pm-2',
          orgId: mockOrgId,
          authorizationCode: 'AUTH2',
          last4: '2222',
          brand: 'mastercard',
          expMonth: 2,
          expYear: 2026,
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockService.listPaymentMethods.mockResolvedValue(mockMethods);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/payment-methods',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': 'user-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });
  });

  describe('POST /api/payment-methods/:id/set-default', () => {
    it('should set payment method as default', async () => {
      const methodId = 'pm-123';
      const updatedMethod = {
        id: methodId,
        orgId: mockOrgId,
        authorizationCode: 'AUTH123',
        last4: '4242',
        brand: 'visa',
        expMonth: 12,
        expYear: 2025,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockService.setDefaultPaymentMethod.mockResolvedValue(updatedMethod);

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/payment-methods/${methodId}/set-default`,
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': 'user-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.isDefault).toBe(true);
    });

    it('should return 404 if payment method not found', async () => {
      mockService.setDefaultPaymentMethod.mockRejectedValue(new Error('Payment method not found'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/payment-methods/nonexistent/set-default',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': 'user-1',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/payment-methods/:id', () => {
    it('should remove payment method', async () => {
      const methodId = 'pm-123';
      mockService.removePaymentMethod.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/payment-methods/${methodId}`,
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': 'user-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 404 if payment method not found', async () => {
      mockService.removePaymentMethod.mockRejectedValue(new Error('Payment method not found'));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/payment-methods/nonexistent',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-org-id': mockOrgId,
          'x-user-id': 'user-1',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
