/**
 * Unit tests for Card Updates & Payment Method Management Service
 */

// Set env before importing module
process.env.PAYSTACK_SECRET_KEY = 'test-secret-key';

// Mock prisma
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    paymentMethod: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';
import {
  ensurePaystackCustomer,
  addPaymentMethod,
  listPaymentMethods,
  setDefaultPaymentMethod,
  removePaymentMethod,
  getDefaultPaymentMethod,
} from '../../../lib/implement-card-updates-&-payment-method-management';

const mockPrisma = prisma as any;

// Setup fetch mock
beforeAll(() => {
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = undefined as any;
});

describe('Payment Method Management', () => {
  const mockOrgId = 'org-123';
  const mockCustomerCode = 'CUST_abc123';
  const mockAuthCode = 'AUTH_xyz789';

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('ensurePaystackCustomer', () => {
    it('should create new customer if not exists', async () => {
      const mockOrg = {
        id: mockOrgId,
        email: 'billing@example.com',
        name: 'Example Corp',
        paystackCustomerCode: null,
      };
      mockPrisma.organization.findUnique = jest.fn().mockResolvedValue(mockOrg);
      mockPrisma.organization.update = jest.fn().mockResolvedValue({
        paystackCustomerCode: mockCustomerCode,
        email: mockOrg.email,
        name: mockOrg.name,
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: true,
          data: {
            id: 1,
            email: mockOrg.email,
            customer_code: mockCustomerCode,
            createdAt: new Date().toISOString(),
          },
        }),
      });

      const result = await ensurePaystackCustomer(mockOrgId);

      expect(result.paystackCustomerCode).toBe(mockCustomerCode);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: mockOrgId },
        data: { paystackCustomerCode: mockCustomerCode },
        select: { paystackCustomerCode: true, email: true, name: true },
      });
    });

    it('should return existing customer code if present', async () => {
      const mockOrg = {
        id: mockOrgId,
        email: 'billing@example.com',
        name: 'Example Corp',
        paystackCustomerCode: mockCustomerCode,
      };
      mockPrisma.organization.findUnique = jest.fn().mockResolvedValue(mockOrg);

      const result = await ensurePaystackCustomer(mockOrgId);

      expect(result.paystackCustomerCode).toBe(mockCustomerCode);
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    });

    it('should throw if organization not found', async () => {
      mockPrisma.organization.findUnique = jest.fn().mockResolvedValue(null);

      await expect(ensurePaystackCustomer('nonexistent')).rejects.toThrow('Organization not found');
    });
  });

  describe('addPaymentMethod', () => {
    it('should add payment method to customer and store in DB', async () => {
      mockPrisma.organization.findUnique = jest.fn().mockResolvedValue({
        id: mockOrgId,
        email: 'billing@example.com',
        name: 'Example Corp',
        paystackCustomerCode: mockCustomerCode,
      });

      mockPrisma.paymentMethod.count = jest.fn().mockResolvedValue(0);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: true,
          data: {
            authorization_code: mockAuthCode,
            card: {
              last4: '4242',
              brand: 'visa',
              exp_month: 12,
              exp_year: 2025,
            },
          },
        }),
      });

      const mockCreated = {
        id: 'pm-123',
        orgId: mockOrgId,
        authorizationCode: mockAuthCode,
        last4: '4242',
        brand: 'visa',
        expMonth: 12,
        expYear: 2025,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.paymentMethod.create = jest.fn().mockResolvedValue(mockCreated);

      const result = await addPaymentMethod(mockOrgId, mockAuthCode);

      expect(result.isDefault).toBe(true);
      expect(result.last4).toBe('4242');
    });

    it('should not set default if other cards exist', async () => {
      mockPrisma.organization.findUnique = jest.fn().mockResolvedValue({
        id: mockOrgId,
        email: 'billing@example.com',
        paystackCustomerCode: mockCustomerCode,
      });

      mockPrisma.paymentMethod.count = jest.fn().mockResolvedValue(2);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: true,
          data: {
            authorization_code: mockAuthCode,
            card: { last4: '1111', brand: 'mastercard', exp_month: 1, exp_year: 2026 },
          },
        }),
      });

      const mockCreated = {
        id: 'pm-124',
        orgId: mockOrgId,
        authorizationCode: mockAuthCode,
        last4: '1111',
        brand: 'mastercard',
        expMonth: 1,
        expYear: 2026,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.paymentMethod.create = jest.fn().mockResolvedValue(mockCreated);

      const result = await addPaymentMethod(mockOrgId, mockAuthCode);

      expect(result.isDefault).toBe(false);
    });
  });

  describe('listPaymentMethods', () => {
    it('should return all payment methods for org ordered by default then date', async () => {
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
          createdAt: new Date('2025-01-02'),
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
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.paymentMethod.findMany = jest.fn().mockResolvedValue(mockMethods);

      const result = await listPaymentMethods(mockOrgId);

      expect(result).toHaveLength(2);
      expect(result[0].isDefault).toBe(true);
    });
  });

  describe('setDefaultPaymentMethod', () => {
    it('should set specified method as default and unset others', async () => {
      const methodId = 'pm-123';

      mockPrisma.paymentMethod.findFirst = jest.fn()
        .mockResolvedValueOnce({
          id: methodId,
          orgId: mockOrgId,
          isDefault: false,
        });

      mockPrisma.paymentMethod.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      mockPrisma.paymentMethod.update = jest.fn().mockResolvedValue({
        id: methodId,
        orgId: mockOrgId,
        isDefault: true,
      });

      const result = await setDefaultPaymentMethod(mockOrgId, methodId);

      expect(result.isDefault).toBe(true);
      expect(mockPrisma.paymentMethod.updateMany).toHaveBeenCalledWith({
        where: { orgId: mockOrgId, id: { not: methodId } },
        data: { isDefault: false },
      });
    });

    it('should throw if method not found or belongs to different org', async () => {
      mockPrisma.paymentMethod.findFirst = jest.fn().mockResolvedValue(null);

      await expect(setDefaultPaymentMethod(mockOrgId, 'nonexistent')).rejects.toThrow('Payment method not found');
    });
  });

  describe('removePaymentMethod', () => {
    it('should remove method and set another as default if available', async () => {
      const methodId = 'pm-123';
      const existingMethod = {
        id: 'pm-456',
        orgId: mockOrgId,
        authorizationCode: 'AUTH456',
        createdAt: new Date(),
      };

      // First call: find the method to delete
      // Second call: find remaining after delete
      mockPrisma.paymentMethod.findFirst = jest.fn()
        .mockResolvedValueOnce({
          id: methodId,
          orgId: mockOrgId,
          authorizationCode: 'AUTH123',
        })
        .mockResolvedValueOnce(existingMethod);

      mockPrisma.paymentMethod.delete = jest.fn().mockResolvedValue({});
      mockPrisma.paymentMethod.update = jest.fn().mockResolvedValue(existingMethod);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: true }),
      });

      await removePaymentMethod(mockOrgId, methodId);

      expect(mockPrisma.paymentMethod.delete).toHaveBeenCalledWith({ where: { id: methodId } });
      expect(mockPrisma.paymentMethod.update).toHaveBeenCalledWith({
        where: { id: 'pm-456' },
        data: { isDefault: true },
      });
    });

    it('should not fail if Paystack removal fails', async () => {
      const methodId = 'pm-123';

      // Return method, then after delete return null for remaining methods check
      mockPrisma.paymentMethod.findFirst = jest.fn()
        .mockResolvedValueOnce({
          id: methodId,
          orgId: mockOrgId,
          authorizationCode: 'AUTH123',
        })
        .mockResolvedValueOnce(null); // no remaining methods

      mockPrisma.paymentMethod.delete = jest.fn().mockResolvedValue({});

      // Simulate Paystack error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(removePaymentMethod(mockOrgId, methodId)).resolves.not.toThrow();
      expect(mockPrisma.paymentMethod.delete).toHaveBeenCalled();
    });
  });

  describe('getDefaultPaymentMethod', () => {
    it('should return default method if exists', async () => {
      const defaultMethod = {
        id: 'pm-1',
        orgId: mockOrgId,
        isDefault: true,
      };
      mockPrisma.paymentMethod.findFirst = jest.fn().mockResolvedValue(defaultMethod);

      const result = await getDefaultPaymentMethod(mockOrgId);

      expect(result).toEqual(defaultMethod);
    });

    it('should return null if no default', async () => {
      mockPrisma.paymentMethod.findFirst = jest.fn().mockResolvedValue(null);

      const result = await getDefaultPaymentMethod(mockOrgId);

      expect(result).toBeNull();
    });
  });
});
