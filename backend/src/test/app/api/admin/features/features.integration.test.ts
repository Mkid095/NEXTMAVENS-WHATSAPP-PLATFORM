/**
 * Integration tests for Admin Feature Management API
 */

import Fastify from 'fastify';
type FastifyInstance = InstanceType<typeof Fastify>;

// Mock feature management service
jest.mock('../../../../../lib/feature-management', () => ({
  getFeatureFlag: jest.fn(),
  setFeatureFlag: jest.fn(),
  listFeatureFlags: jest.fn(),
  getOrgFeatureOverride: jest.fn(),
  setOrgFeatureOverride: jest.fn(),
  listOrgFeatureOverrides: jest.fn(),
  deleteOrgFeatureOverride: jest.fn(),
}));

// Mock prisma
jest.mock('../../../../../lib/prisma', () => ({
  prisma: {
    featureFlag: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    organizationFeatureFlag: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
  },
}));

import {
  getFeatureFlag,
  setFeatureFlag,
  listFeatureFlags,
  getOrgFeatureOverride,
  setOrgFeatureOverride,
  listOrgFeatureOverrides,
  deleteOrgFeatureOverride,
} from '../../../../../lib/feature-management';

import { registerFeatureRoutes } from '../../../../../app/api/admin/features/route';
import { prisma } from '../../../../../lib/prisma';

const mockFeatureFlags = [
  {
    id: 'ff-1',
    key: 'billing_enabled' as const,
    name: 'Billing System',
    description: 'Enable billing subsystem',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'ff-2',
    key: 'payments_enabled' as const,
    name: 'Payments',
    description: 'Enable payment processing',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockOrg = {
  id: 'org-123',
  name: 'Test Corp',
  slug: 'test-corp',
};

describe('Admin Feature Management API', () => {
  let fastify: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    jest.clearAllMocks();

    // Simplified auth hook mimicking global auth middleware
    fastify.addHook('preHandler', async (request, reply) => {
      const userId = request.headers['x-user-id'] as string | undefined;
      const role = (request.headers['x-user-role'] as string) || 'USER';

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      // Attach user object (orgId may be set for ORG_ADMIN)
      (request as any).user = {
        id: userId,
        role,
        orgId: role === 'SUPER_ADMIN' ? null : (request.headers['x-org-id'] as string),
      };
    });

    await fastify.register(registerFeatureRoutes, { prefix: '/admin/features' });
  });

  afterAll(async () => {
    await fastify.close();
  });

  // ============================================================================
  // GET /admin/features
  // ============================================================================

  describe('GET /admin/features', () => {
    it('should list all feature flags with overrides for SUPER_ADMIN', async () => {
      (listFeatureFlags as jest.Mock).mockResolvedValue(mockFeatureFlags);
      (prisma.organizationFeatureFlag as any).findMany.mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/features',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].featureKey).toBe('billing_enabled');
      expect(body.data[0].globalEnabled).toBe(true);
      expect(body.data[0].orgOverrides).toEqual([]);
    });

    it('should include org overrides summary', async () => {
      (listFeatureFlags as jest.Mock).mockResolvedValue([mockFeatureFlags[0]]);
      (prisma.organizationFeatureFlag as any).findMany.mockResolvedValue([
        {
          orgId: 'org-1',
          org: { id: 'org-1', name: 'Acme', slug: 'acme' },
          featureKey: 'billing_enabled',
          enabled: false,
        },
        {
          orgId: 'org-2',
          org: { id: 'org-2', name: 'Beta', slug: 'beta' },
          featureKey: 'billing_enabled',
          enabled: true,
        },
      ]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/features',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data[0].orgOverrides).toHaveLength(2);
    });

    it('should return 403 for non-SUPER_ADMIN', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/features',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': 'org-123',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  // ============================================================================
  // POST /admin/features/:key
  // ============================================================================

  describe('POST /admin/features/:key', () => {
    it('should set global feature flag', async () => {
      (setFeatureFlag as jest.Mock).mockResolvedValue({
        ...mockFeatureFlags[0],
        enabled: false,
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/billing_enabled',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(false);
    });

    it('should return 400 for invalid feature key', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/invalid_key',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing enabled field', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/payments_enabled',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 403 for non-SUPER_ADMIN', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/billing_enabled',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': 'org-123',
        },
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ============================================================================
  // GET /admin/features/org/:orgId
  // ============================================================================

  describe('GET /admin/features/org/:orgId', () => {
    it('should list org overrides with global states', async () => {
      (prisma.organization as any).findUnique.mockResolvedValue(mockOrg);
      (listOrgFeatureOverrides as jest.Mock).mockResolvedValue([
        { orgId: 'org-123', featureKey: 'payments_enabled', enabled: false },
      ]);
      (getFeatureFlag as jest.Mock).mockResolvedValue(mockFeatureFlags[1]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/features/org/org-123',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.org.id).toBe('org-123');
      expect(body.data.overrides).toHaveLength(1);
      expect(body.data.overrides[0].globalValue).toBe(true);
      expect(body.data.overrides[0].effectiveValue).toBe(false);
    });

    it('should return 404 for nonexistent org', async () => {
      (prisma.organization as any).findUnique.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/features/org/nonexistent',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for non-SUPER_ADMIN', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/features/org/org-123',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': 'org-123',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ============================================================================
  // POST /admin/features/org/:orgId/:key
  // ============================================================================

  describe('POST /admin/features/org/:orgId/:key', () => {
    it('should set org override to enabled', async () => {
      (prisma.organization as any).findUnique.mockResolvedValue(mockOrg);
      (setOrgFeatureOverride as jest.Mock).mockResolvedValue({
        orgId: 'org-123',
        featureKey: 'payments_enabled',
        enabled: true,
        id: 'ofo-new',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/org/org-123/payments_enabled',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(true);
    });

    it('should remove override when enabled is null', async () => {
      (prisma.organization as any).findUnique.mockResolvedValue(mockOrg);
      (setOrgFeatureOverride as jest.Mock).mockResolvedValue({
        orgId: 'org-123',
        featureKey: 'payments_enabled',
        enabled: null,
        id: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/org/org-123/payments_enabled',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
        payload: { enabled: null },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.enabled).toBeNull();
    });

    it('should return 404 for nonexistent org', async () => {
      (prisma.organization as any).findUnique.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/org/nonexistent/payments_enabled',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid feature key', async () => {
      (prisma.organization as any).findUnique.mockResolvedValue(mockOrg);

      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/org/org-123/invalid_key',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 403 for non-SUPER_ADMIN', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/admin/features/org/org-123/payments_enabled',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': 'org-123',
        },
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ============================================================================
  // DELETE /admin/features/org/:orgId/:key
  // ============================================================================

  describe('DELETE /admin/features/org/:orgId/:key', () => {
    it('should delete org override', async () => {
      (deleteOrgFeatureOverride as jest.Mock).mockResolvedValue(true);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/admin/features/org/org-123/payments_enabled',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('removed');
    });

    it('should return 404 if override not found', async () => {
      (deleteOrgFeatureOverride as jest.Mock).mockResolvedValue(false);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/admin/features/org/org-123/payments_enabled',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid feature key', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/admin/features/org/org-123/invalid_key',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 403 for non-SUPER_ADMIN', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/admin/features/org/org-123/payments_enabled',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': 'org-123',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
