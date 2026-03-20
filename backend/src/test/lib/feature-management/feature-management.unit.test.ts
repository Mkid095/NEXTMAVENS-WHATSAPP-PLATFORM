/**
 * Unit tests for Feature Management Service
 */

import { PrismaClient } from '@prisma/client';

// Mock Prisma before importing the service
jest.mock('../../../lib/prisma', () => {
  const mockPrisma = {
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
  };
  return { prisma: mockPrisma as any };
});

import { prisma } from '../../../lib/prisma';
import * as featureService from '../../../lib/feature-management';
import type { FeatureFlag, OrganizationFeatureFlag } from '../../../lib/feature-management/types';

const mockPrisma = prisma as any;

describe('Feature Management Service', () => {
  const mockFeatureFlag: FeatureFlag = {
    id: 'ff-123',
    key: 'payments_enabled',
    name: 'Payments',
    description: 'Enable payment processing',
    enabled: true,
    createdAt: new Date('2025-03-20T10:00:00Z'),
    updatedAt: new Date('2025-03-20T10:00:00Z'),
  };

  const mockOrgOverride: OrganizationFeatureFlag = {
    id: 'ofo-123',
    orgId: 'org-123',
    featureKey: 'payments_enabled',
    enabled: false,
    createdAt: new Date('2025-03-20T10:00:00Z'),
    updatedAt: new Date('2025-03-20T10:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFeatureFlag', () => {
    it('should return feature flag when found', async () => {
      const flag = { ...mockFeatureFlag, createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.featureFlag.findUnique.mockResolvedValue(flag);

      const result = await featureService.getFeatureFlag('payments_enabled');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(flag.id);
      expect(mockPrisma.featureFlag.findUnique).toHaveBeenCalledWith({
        where: { key: 'payments_enabled' },
      });
    });

    it('should return null when feature flag not found', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      const result = await featureService.getFeatureFlag('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('setFeatureFlag', () => {
    it('should create new feature flag when not exists', async () => {
      const createdFlag = {
        ...mockFeatureFlag,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.featureFlag.upsert.mockResolvedValue(createdFlag);

      const result = await featureService.setFeatureFlag('payments_enabled', true);

      expect(result).not.toBeNull();
      expect(result?.enabled).toBe(true);
      expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'payments_enabled' },
          create: {
            key: 'payments_enabled',
            name: 'Payments',
            enabled: true,
          },
          update: {
            enabled: true,
            updatedAt: expect.any(Date),
          },
        })
      );
    });

    it('should update existing feature flag', async () => {
      const updatedFlag = { ...mockFeatureFlag, enabled: false, updatedAt: new Date() };
      mockPrisma.featureFlag.upsert.mockResolvedValue(updatedFlag);

      const result = await featureService.setFeatureFlag('payments_enabled', false);

      expect(result.enabled).toBe(false);
      // The upsert method takes a single argument object
      expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'payments_enabled' },
          update: expect.objectContaining({ enabled: false }),
          create: expect.any(Object),
        })
      );
    });
  });

  describe('listFeatureFlags', () => {
    it('should return all feature flags sorted by key', async () => {
      const flags = [
        { ...mockFeatureFlag, key: 'billing_enabled', name: 'Billing', createdAt: new Date(), updatedAt: new Date() },
        { ...mockFeatureFlag, key: 'payments_enabled', name: 'Payments', createdAt: new Date(), updatedAt: new Date() },
      ];
      mockPrisma.featureFlag.findMany.mockResolvedValue(flags);

      const result = await featureService.listFeatureFlags();

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('billing_enabled'); // sorted as per orderBy in service
      expect(result[1].key).toBe('payments_enabled');
    });

    it('should return empty array when no flags', async () => {
      mockPrisma.featureFlag.findMany.mockResolvedValue([]);

      const result = await featureService.listFeatureFlags();

      expect(result).toEqual([]);
    });
  });

  describe('getOrgFeatureOverride', () => {
    it('should return org override when exists', async () => {
      mockPrisma.organizationFeatureFlag.findUnique.mockResolvedValue(mockOrgOverride);

      const result = await featureService.getOrgFeatureOverride('org-123', 'payments_enabled');

      expect(result).toEqual({
        orgId: 'org-123',
        featureKey: 'payments_enabled',
        enabled: false,
      });
    });

    it('should return null when no override exists', async () => {
      mockPrisma.organizationFeatureFlag.findUnique.mockResolvedValue(null);

      const result = await featureService.getOrgFeatureOverride('org-123', 'payments_enabled');

      expect(result).toBeNull();
    });
  });

  describe('setOrgFeatureOverride', () => {
    it('should create new override', async () => {
      mockPrisma.organizationFeatureFlag.upsert.mockResolvedValue(mockOrgOverride);

      const result = await featureService.setOrgFeatureOverride('org-123', 'payments_enabled', false);

      expect(result.enabled).toBe(false);
      expect(mockPrisma.organizationFeatureFlag.upsert).toHaveBeenCalledWith({
        where: { orgId_featureKey: { orgId: 'org-123', featureKey: 'payments_enabled' } },
        create: {
          orgId: 'org-123',
          featureKey: 'payments_enabled',
          enabled: false,
        },
        update: {
          enabled: false,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should delete override when enabled is null', async () => {
      mockPrisma.organizationFeatureFlag.delete.mockResolvedValue({} as any);

      const result = await featureService.setOrgFeatureOverride('org-123', 'payments_enabled', null);

      expect(result.enabled).toBeNull();
      expect(mockPrisma.organizationFeatureFlag.delete).toHaveBeenCalledWith({
        where: { orgId_featureKey: { orgId: 'org-123', featureKey: 'payments_enabled' } },
      });
    });

    it('should handle successful delete when record not found', async () => {
      mockPrisma.organizationFeatureFlag.delete.mockRejectedValue({
        code: 'P2025',
      });

      const result = await featureService.setOrgFeatureOverride('org-123', 'payments_enabled', null);

      expect(result.enabled).toBeNull();
    });
  });

  describe('listOrgFeatureOverrides', () => {
    it('should return all overrides for org', async () => {
      const overrides = [
        mockOrgOverride,
        { ...mockOrgOverride, featureKey: 'invoices_enabled', enabled: true },
      ];
      mockPrisma.organizationFeatureFlag.findMany.mockResolvedValue(overrides);

      const result = await featureService.listOrgFeatureOverrides('org-123');

      expect(result).toHaveLength(2);
      expect(result[0].featureKey).toBe('payments_enabled');
      expect(result[1].featureKey).toBe('invoices_enabled');
    });

    it('should return empty array when no overrides', async () => {
      mockPrisma.organizationFeatureFlag.findMany.mockResolvedValue([]);

      const result = await featureService.listOrgFeatureOverrides('org-123');

      expect(result).toEqual([]);
    });
  });

  describe('deleteOrgFeatureOverride', () => {
    it('should delete override successfully', async () => {
      mockPrisma.organizationFeatureFlag.delete.mockResolvedValue({} as any);

      const result = await featureService.deleteOrgFeatureOverride('org-123', 'payments_enabled');

      expect(result).toBe(true);
    });

    it('should return true if override not found', async () => {
      mockPrisma.organizationFeatureFlag.delete.mockRejectedValue({
        code: 'P2025',
      });

      const result = await featureService.deleteOrgFeatureOverride('org-123', 'payments_enabled');

      expect(result).toBe(true);
    });

    it('should throw for other errors', async () => {
      const error = new Error('Database error');
      // @ts-ignore - add code property
      error.code = 'OTHER_ERROR';
      mockPrisma.organizationFeatureFlag.delete.mockRejectedValue(error);

      await expect(
        featureService.deleteOrgFeatureOverride('org-123', 'payments_enabled')
      ).rejects.toThrow('Database error');
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return org override when exists (enabled)', async () => {
      mockPrisma.organizationFeatureFlag.findUnique.mockResolvedValue({
        ...mockOrgOverride,
        enabled: true,
      });

      const result = await featureService.isFeatureEnabled('org-123', 'payments_enabled');

      expect(result).toBe(true);
    });

    it('should return org override when exists (disabled)', async () => {
      mockPrisma.organizationFeatureFlag.findUnique.mockResolvedValue(mockOrgOverride);

      const result = await featureService.isFeatureEnabled('org-123', 'payments_enabled');

      expect(result).toBe(false);
    });

    it('should inherit global flag when no org override', async () => {
      mockPrisma.organizationFeatureFlag.findUnique.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFeatureFlag);

      const result = await featureService.isFeatureEnabled('org-123', 'payments_enabled');

      expect(result).toBe(true);
    });

    it('should return false when global flag disabled and no override', async () => {
      mockPrisma.organizationFeatureFlag.findUnique.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ ...mockFeatureFlag, enabled: false });

      const result = await featureService.isFeatureEnabled('org-123', 'payments_enabled');

      expect(result).toBe(false);
    });

    it('should return global flag when orgId is null (SUPER_ADMIN)', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFeatureFlag);

      const result = await featureService.isFeatureEnabled(null, 'payments_enabled');

      expect(result).toBe(true);
    });

    it('should return false when no orgId and flag not exists', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      const result = await featureService.isFeatureEnabled(null, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('checkFeatureAccess', () => {
    it('should return disabled when flag not found', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      const result = await featureService.checkFeatureAccess('org-123', 'nonexistent');

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('disabled');
    });

    it('should return org_override reason when org override exists (enabled)', async () => {
      mockPrisma.organizationFeatureFlag.findUnique.mockResolvedValue({
        ...mockOrgOverride,
        enabled: true,
      });
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFeatureFlag);

      const result = await featureService.checkFeatureAccess('org-123', 'payments_enabled');

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('org_override');
    });

    it('should return inherited reason when no org override', async () => {
      mockPrisma.organizationFeatureFlag.findUnique.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFeatureFlag);

      const result = await featureService.checkFeatureAccess('org-123', 'payments_enabled');

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('inherited');
    });

    it('should return global reason for SUPER_ADMIN without org', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFeatureFlag);

      const result = await featureService.checkFeatureAccess(null, 'payments_enabled');

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('global');
    });
  });

  describe('initializeFeatureFlags', () => {
    it('should create all default flags if they do not exist', async () => {
      // Mock getFeatureFlag to return null for all (none exist)
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);
      // Mock setFeatureFlag to return the created flag
      const createdFlag = { ...mockFeatureFlag, createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.featureFlag.upsert.mockResolvedValue(createdFlag);

      await featureService.initializeFeatureFlags();

      expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledTimes(6);
      // Check first call argument
      const firstCallArg = (mockPrisma.featureFlag.upsert as jest.Mock).mock.calls[0][0];
      expect(firstCallArg.where).toEqual({ key: 'billing_enabled' });
      expect(firstCallArg.create).toEqual({
        key: 'billing_enabled',
        name: 'Billing System',
        enabled: true,
      });
      expect(firstCallArg.update).toEqual({
        enabled: true,
        updatedAt: expect.any(Date),
      });
    });

    it('should not create flags that already exist', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockFeatureFlag);

      await featureService.initializeFeatureFlags();

      expect(mockPrisma.featureFlag.upsert).not.toHaveBeenCalled();
    });
  });
});
