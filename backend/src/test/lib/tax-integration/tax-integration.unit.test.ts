/**
 * Unit tests for Tax Integration Service
 */

import { prisma } from '../../../lib/prisma';
import {
  getTaxConfig,
  calculateTaxAmount,
  createTaxLineItem,
  calculateTax,
  updateTaxConfig,
  healthCheck,
} from '../../../lib/tax-integration';
import type { TaxConfig } from '../../../lib/tax-integration/types';

// Mock prisma
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as any;

describe('Tax Integration', () => {
  const mockOrgId = 'org-123';
  const mockTaxConfig: TaxConfig = {
    orgId: mockOrgId,
    taxRate: 7.5,
    taxName: 'VAT',
    taxId: 'TAX123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTaxConfig', () => {
    it('should return tax config when organization has tax settings', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        taxRate: 7.5,
        taxName: 'VAT',
        taxId: 'TAX123',
      } as any);

      const result = await getTaxConfig(mockOrgId);

      expect(result).toEqual({
        orgId: mockOrgId,
        taxRate: 7.5,
        taxName: 'VAT',
        taxId: 'TAX123',
      });
    });

    it('should return null when no tax rate set', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        taxRate: null,
        taxName: null,
        taxId: null,
      } as any);

      const result = await getTaxConfig(mockOrgId);

      expect(result).toBeNull();
    });

    it('should return null when org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const result = await getTaxConfig(mockOrgId);

      expect(result).toBeNull();
    });
  });

  describe('calculateTaxAmount', () => {
    it('should calculate tax correctly', () => {
      const tax = calculateTaxAmount(1000, 7.5); // 7.5% of 1000 cents = 75 cents
      expect(tax).toBe(75);
    });

    it('should return 0 for zero rate', () => {
      const tax = calculateTaxAmount(1000, 0);
      expect(tax).toBe(0);
    });

    it('should round to nearest cent', () => {
      // 1000 * 8.75 = 87.5 -> round to 88
      const tax = calculateTaxAmount(1000, 8.75);
      expect(tax).toBe(88);
    });
  });

  describe('createTaxLineItem', () => {
    it('should create tax line item with correct format', () => {
      const lineItem = createTaxLineItem(mockTaxConfig, 75);
      expect(lineItem).toEqual({
        description: 'VAT (7.5%)',
        amountCents: 75,
      });
    });
  });

  describe('calculateTax', () => {
    it('should return full breakdown with tax', () => {
      const result = calculateTax(1000, mockTaxConfig);
      expect(result).toEqual({
        preTaxAmount: 1000,
        taxAmount: 75,
        totalAmount: 1075,
        taxRate: 7.5,
        taxName: 'VAT',
      });
    });

    it('should return no tax when config is null', () => {
      const result = calculateTax(1000, null);
      expect(result).toEqual({
        preTaxAmount: 1000,
        taxAmount: 0,
        totalAmount: 1000,
        taxRate: 0,
        taxName: 'No Tax',
      });
    });
  });

  describe('updateTaxConfig', () => {
    it('should update organization tax settings', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        taxRate: 10,
        taxName: 'GST',
        taxId: 'NEWID',
      } as any);

      const result = await updateTaxConfig(mockOrgId, 10, 'GST', 'NEWID');

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: mockOrgId },
        data: { taxRate: 10, taxName: 'GST', taxId: 'NEWID' },
        select: { taxRate: true, taxName: true, taxId: true },
      });
      expect(result).toEqual({
        orgId: mockOrgId,
        taxRate: 10,
        taxName: 'GST',
        taxId: 'NEWID',
      });
    });

    it('should throw if tax rate is not positive', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        taxRate: null,
        taxName: 'VAT',
        taxId: 'ID',
      } as any);

      await expect(updateTaxConfig(mockOrgId, 0)).rejects.toThrow('Tax rate must be set to a positive number');
    });
  });

  describe('healthCheck', () => {
    it('should return true', () => {
      expect(healthCheck()).toBe(true);
    });
  });
});
