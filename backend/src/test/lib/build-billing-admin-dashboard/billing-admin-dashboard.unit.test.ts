/**
 * Unit tests for Billing Admin Dashboard Service
 */

// Mock usage billing service (to avoid paystack-client loading)
jest.mock('../../../lib/implement-usage-based-billing-&-overage', () => ({
  getCurrentUsage: jest.fn(),
}));

// Mock prisma
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    organization: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
    },
    invoice: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

import { prisma } from '../../../lib/prisma';
import {
  getBillingOverview,
  getOrgBillingSummary,
  getInvoiceDetail,
  listInvoices,
  getUsageSummary,
  getBillingMetrics,
} from '../../../lib/build-billing-admin-dashboard';

const mockPrisma = prisma as any;
const mockGetCurrentUsage = require('../../../lib/implement-usage-based-billing-&-overage').getCurrentUsage as jest.Mock;

describe('Billing Admin Dashboard', () => {
  const mockOrgId = 'org-123';
  const mockInvoiceId = 'inv-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBillingOverview', () => {
    it('should return billing overview aggregates', async () => {
      mockPrisma.invoice.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(75) // paid
        .mockResolvedValueOnce(10); // overdue

      mockPrisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500000 } }) // revenue (paid)
        .mockResolvedValueOnce({ _sum: { amount: 50000 } }) // pending (open+draft)
        .mockResolvedValueOnce({ _avg: { amount: 6666 } }); // average

      mockPrisma.invoice.groupBy.mockResolvedValueOnce([
        { orgId: 'org1' },
        { orgId: 'org2' },
      ]);

      const result = await getBillingOverview();

      expect(result).toEqual({
        totalRevenueCents: 500000,
        pendingRevenueCents: 50000,
        overdueInvoicesCount: 10,
        totalInvoicesCount: 100,
        paidInvoicesCount: 75,
        activeOrganizationsCount: 2,
        averageInvoiceAmountCents: 6666,
      });
    });

    it('should handle empty database', async () => {
      // Three aggregate calls: revenue, pending, avg
      mockPrisma.invoice.count = jest.fn()
        .mockResolvedValueOnce(0) // total count
        .mockResolvedValueOnce(0) // paid count
        .mockResolvedValueOnce(0); // overdue count

      mockPrisma.invoice.aggregate = jest.fn()
        .mockResolvedValueOnce({ _sum: { amount: 0 } }) // revenue
        .mockResolvedValueOnce({ _sum: { amount: 0 } }) // pending
        .mockResolvedValueOnce({ _avg: { amount: 0 } }); // average

      mockPrisma.invoice.groupBy = jest.fn().mockResolvedValue([]); // active orgs

      const result = await getBillingOverview();

      expect(result.totalRevenueCents).toBe(0);
      expect(result.pendingRevenueCents).toBe(0);
      expect(result.totalInvoicesCount).toBe(0);
      expect(result.paidInvoicesCount).toBe(0);
      expect(result.overdueInvoicesCount).toBe(0);
      expect(result.averageInvoiceAmountCents).toBe(0);
      expect(result.activeOrganizationsCount).toBe(0);
    });
  });

  describe('getOrgBillingSummary', () => {
    const mockOrgs = [
      {
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme',
        plan: 'PRO',
        email: 'billing@acme.com',
        taxRate: 7.5,
        taxName: 'VAT',
        taxId: 'VAT123',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-02'),
        invoices: [
          {
            id: 'inv-1',
            amount: 50000,
            status: 'PAID',
            createdAt: new Date('2025-04-01'),
            items: [],
          },
          {
            id: 'inv-2',
            amount: 25000,
            status: 'OPEN',
            createdAt: new Date('2025-04-15'),
            items: [],
          },
        ],
      },
      {
        id: 'org-2',
        name: 'Beta Ltd',
        slug: 'beta',
        plan: 'STARTER',
        email: null,
        taxRate: null,
        taxName: null,
        taxId: null,
        createdAt: new Date('2025-02-01'),
        updatedAt: new Date('2025-02-02'),
        invoices: [],
      },
    ];

    it('should return summary for all orgs', async () => {
      mockPrisma.organization.findMany.mockResolvedValue(mockOrgs);

      const result = await getOrgBillingSummary();

      expect(result).toHaveLength(2);
      expect(result[0].orgId).toBe('org-1');
      expect(result[0].orgName).toBe('Acme Corp');
      expect(result[0].totalInvoicedCents).toBe(75000);
      expect(result[0].totalPaidCents).toBe(50000);
      expect(result[0].outstandingBalanceCents).toBe(25000);
      expect(result[0].invoiceCount).toBe(2);
      expect(result[0].taxRate).toBe(7.5);
      expect(result[0].taxName).toBe('VAT');

      expect(result[1].orgId).toBe('org-2');
      expect(result[1].totalInvoicedCents).toBe(0);
    });

    it('should return summary for specific org', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([mockOrgs[0]]);

      const result = await getOrgBillingSummary('org-1');

      expect(result).toHaveLength(1);
      expect(result[0].orgId).toBe('org-1');
      expect(result[0].email).toBe('billing@acme.com');
    });

    it('should handle org with no invoices', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([mockOrgs[1]]);

      const result = await getOrgBillingSummary('org-2');

      expect(result[0].totalInvoicedCents).toBe(0);
      expect(result[0].totalPaidCents).toBe(0);
      expect(result[0].outstandingBalanceCents).toBe(0);
    });
  });

  describe('getInvoiceDetail', () => {
    it('should return invoice with items', async () => {
      const mockInvoice = {
        id: mockInvoiceId,
        orgId: mockOrgId,
        stripeInvoiceId: 'pay-123',
        number: 'INV-001',
        amount: 10000,
        currency: 'USD',
        status: 'PAID',
        periodStart: new Date('2025-03-01'),
        periodEnd: new Date('2025-03-31'),
        dueDate: new Date('2025-04-15'),
        paidAt: new Date('2025-04-10'),
        createdAt: new Date('2025-04-01'),
        updatedAt: new Date('2025-04-01'),
        items: [
          {
            id: 'item-1',
            invoiceId: mockInvoiceId,
            orgId: mockOrgId,
            description: 'Overage - api_requests',
            quantity: 1,
            unitPriceCents: 10000,
            totalCents: 10000,
            metadata: null,
          },
        ],
        org: { id: mockOrgId, name: 'Acme Corp' },
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);

      const result = await getInvoiceDetail(mockInvoiceId);

      expect(result).not.toBeNull();
      expect(result!.number).toBe('INV-001');
      expect(result!.orgName).toBe('Acme Corp');
      expect(result!.items).toHaveLength(1);
      expect(result!.items[0].description).toBe('Overage - api_requests');
    });

    it('should return null when invoice not found', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      const result = await getInvoiceDetail('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listInvoices', () => {
    it('should return paginated invoice list', async () => {
      const mockInvoices = [
        {
          id: 'inv-1',
          orgId: mockOrgId,
          stripeInvoiceId: 'pay-1',
          number: 'INV-001',
          amount: 10000,
          currency: 'USD',
          status: 'PAID',
          periodStart: new Date('2025-03-01'),
          periodEnd: new Date('2025-03-31'),
          dueDate: new Date('2025-04-15'),
          paidAt: new Date('2025-04-10'),
          createdAt: new Date('2025-04-01'),
          updatedAt: new Date('2025-04-01'),
          items: [],
          org: { id: mockOrgId, name: 'Acme Corp' },
        },
        {
          id: 'inv-2',
          orgId: mockOrgId,
          stripeInvoiceId: 'pay-2',
          number: 'INV-002',
          amount: 5000,
          currency: 'USD',
          status: 'OPEN',
          periodStart: new Date('2025-04-01'),
          periodEnd: new Date('2025-04-30'),
          dueDate: new Date('2025-05-15'),
          paidAt: null,
          createdAt: new Date('2025-04-15'),
          updatedAt: new Date('2025-04-15'),
          items: [],
          org: { id: mockOrgId, name: 'Acme Corp' },
        },
      ];

      mockPrisma.invoice.count.mockResolvedValue(2);
      mockPrisma.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await listInvoices({ orgId: mockOrgId, limit: 10, offset: 0 });

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.limit).toBe(10);
      expect(result.data[0].orgName).toBe('Acme Corp');
    });

    it('should support pagination with hasMore', async () => {
      const mockInvoices = Array(3).fill(null).map((_, i) => ({
        id: `inv-${i+1}`,
        orgId: mockOrgId,
        stripeInvoiceId: `pay-${i+1}`,
        number: `INV-${String(i+1).padStart(3, '0')}`,
        amount: 10000,
        currency: 'USD',
        status: 'PAID',
        periodStart: new Date('2025-03-01'),
        periodEnd: new Date('2025-03-31'),
        dueDate: new Date('2025-04-15'),
        paidAt: new Date('2025-04-10'),
        createdAt: new Date(`2025-04-${i+1}`),
        updatedAt: new Date(`2025-04-${i+1}`),
        items: [],
        org: { id: mockOrgId, name: 'Acme Corp' },
      }));

      mockPrisma.invoice.count.mockResolvedValue(5);
      mockPrisma.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await listInvoices({ limit: 2, offset: 0 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should apply filters correctly', async () => {
      mockPrisma.invoice.count.mockResolvedValue(0);
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await listInvoices({
        orgId: mockOrgId,
        status: 'PAID',
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-12-31'),
        limit: 50,
        offset: 0,
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: mockOrgId,
            status: 'PAID',
            createdAt: {
              gte: new Date('2025-01-01'),
              lte: new Date('2025-12-31'),
            },
          }),
          take: 51,
          skip: 0,
          orderBy: { createdAt: 'desc' },
          include: expect.any(Object),
        })
      );
    });
  });

  describe('getUsageSummary', () => {
    it('should return usage summary for org', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: mockOrgId,
        name: 'Acme Corp',
        plan: 'PRO',
      });

      mockGetCurrentUsage.mockResolvedValue({
        usage: 150000,
        periodStart: new Date('2025-04-01'),
        periodEnd: new Date('2025-04-30'),
      });

      const result = await getUsageSummary(mockOrgId, 'api_requests');

      expect(result).toHaveLength(1);
      expect(result[0].orgId).toBe(mockOrgId);
      expect(result[0].orgName).toBe('Acme Corp');
      expect(result[0].meterName).toBe('api_requests');
      expect(result[0].totalUsage).toBe(150000);
      expect(result[0].includedUnits).toBe(100000);
      expect(result[0].overageUnits).toBe(50000);
      expect(result[0].quotaPercentage).toBe(150);
    });

    it('should handle org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const result = await getUsageSummary('nonexistent');

      expect(result).toHaveLength(0);
    });

    it('should default to api_requests meter if not specified', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: mockOrgId,
        name: 'Acme Corp',
        plan: 'STARTER',
      });

      mockGetCurrentUsage.mockResolvedValue({
        usage: 15000,
        periodStart: new Date(),
        periodEnd: new Date(),
      });

      await getUsageSummary(mockOrgId);

      expect(mockGetCurrentUsage).toHaveBeenCalledWith(mockOrgId, 'api_requests');
    });
  });

  describe('getBillingMetrics', () => {
    it('should return billing metrics with revenue data', async () => {
      // Mock $queryRaw for revenueByMonth
      (prisma as any).$queryRaw
        .mockResolvedValueOnce([
          { month: new Date('2025-01-01'), revenueCents: 100000 },
          { month: new Date('2025-02-01'), revenueCents: 150000 },
        ])
        .mockResolvedValueOnce([
          { org_id: 'org-1', revenueCents: 200000 },
        ])
        .mockResolvedValueOnce([{ avgDays: 5.5 }]);

      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', name: 'Acme Corp' },
      ]);

      mockPrisma.invoice.groupBy.mockResolvedValue([
        { status: 'PAID', _count: { status: 50 } },
        { status: 'OPEN', _count: { status: 10 } },
        { status: 'DRAFT', _count: { status: 5 } },
      ]);

      const result = await getBillingMetrics();

      expect(result.revenueByMonth).toHaveLength(2);
      expect(result.topOrgsByRevenue).toHaveLength(1);
      expect(result.topOrgsByRevenue[0].orgName).toBe('Acme Corp');
      expect(result.invoiceStatusDistribution).toHaveLength(3);
      expect(result.averageTimeToPayDays).toBeCloseTo(5.5, 1);
    });

    it('should handle empty metric data', async () => {
      // $queryRaw called 3 times: revenueByMonth, topOrgs, avgDays
      (prisma as any).$queryRaw = jest.fn()
        .mockResolvedValueOnce([]) // revenueByMonth
        .mockResolvedValueOnce([]) // topOrgs
        .mockResolvedValueOnce([{ avgDays: null }]); // avgDays

      mockPrisma.invoice.groupBy = jest.fn().mockResolvedValue([]); // status distribution

      mockPrisma.organization.findMany = jest.fn().mockResolvedValue([]);

      const result = await getBillingMetrics();

      expect(result.revenueByMonth).toHaveLength(0);
      expect(result.topOrgsByRevenue).toHaveLength(0);
      expect(result.invoiceStatusDistribution).toHaveLength(0);
      expect(result.averageTimeToPayDays).toBeNull();
    });
  });

  describe('healthCheck', () => {
    it('should return true', () => {
      const result = require('../../../lib/build-billing-admin-dashboard').healthCheck();
      expect(result).toBe(true);
    });
  });
});
