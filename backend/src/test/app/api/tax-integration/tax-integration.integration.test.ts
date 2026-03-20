/**
 * Integration tests for Tax Integration API
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Mock prisma (tax module uses it)
jest.mock('../../../../lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Import tax routes
import { registerTaxRoutes } from '../../../../app/api/tax-integration/route';

// Import mocks
import { prisma as mockPrisma } from '../../../../lib/prisma';

const mockOrgId = 'org-123';
const mockUserId = 'user-123';

describe('Tax Integration API', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    jest.clearAllMocks();

    // Mock org exists
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: mockOrgId,
      name: 'Test Org',
      email: 'test@example.com',
      plan: 'STARTER',
      taxRate: null,
      taxName: null,
      taxId: null,
    } as any);
    mockPrisma.organization.update.mockResolvedValue({
      taxRate: 10,
      taxName: 'GST',
      taxId: 'NEWID',
    } as any);

    // Auth hook
    fastify.addHook('preHandler', async (request, reply) => {
      const orgId = request.headers['x-org-id'] as string;
      if (!orgId) {
        reply.code(400).send({ error: 'Missing x-org-id' });
        return;
      }
      const role = (request.headers['x-user-role'] as string) || 'USER';
      (request as any).user = { id: mockUserId, role, orgId };
    });

    // Register tax routes
    await fastify.register(registerTaxRoutes, { prefix: '/api/tax' });
  });

  describe('GET /api/tax/config', () => {
    it('should return tax config for org', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: mockOrgId,
        taxRate: 7.5,
        taxName: 'VAT',
        taxId: 'TAX123',
      } as any);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tax/config',
        headers: {
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        orgId: mockOrgId,
        taxRate: 7.5,
        taxName: 'VAT',
        taxId: 'TAX123',
      });
    });

    it('should return null tax when not set', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tax/config',
        headers: {
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });

    it('should return 400 if missing x-org-id', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tax/config',
        headers: {
          'x-user-id': mockUserId,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/tax/config', () => {
    it('should update tax config as ORG_ADMIN', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        taxRate: 10,
        taxName: 'GST',
        taxId: 'NEWID',
      } as any);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tax/config',
        headers: {
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
          'x-user-role': 'ORG_ADMIN',
        },
        payload: {
          taxRate: 10,
          taxName: 'GST',
          taxId: 'NEWID',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.taxRate).toBe(10);
      expect(body.data.taxName).toBe('GST');
    });

    it('should return 403 for non-admin user', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tax/config',
        headers: {
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
          'x-user-role': 'USER', // not admin
        },
        payload: {
          taxRate: 10,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 for invalid taxRate', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tax/config',
        headers: {
          'x-org-id': mockOrgId,
          'x-user-id': mockUserId,
          'x-user-role': 'ORG_ADMIN',
        },
        payload: {
          taxRate: -5, // invalid
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
