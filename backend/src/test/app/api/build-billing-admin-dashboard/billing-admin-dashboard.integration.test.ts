/**
 * Integration tests for Billing Admin Dashboard API
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Mock usage billing service (to avoid paystack-client loading)
jest.mock('../../../../lib/implement-usage-based-billing-&-overage', () => ({
  generatePeriodInvoice: jest.fn(),
  getCurrentUsage: jest.fn(),
}));

// Mock billing admin dashboard service (we'll test route layer only)
jest.mock('../../../../lib/build-billing-admin-dashboard', () => ({
  getBillingOverview: jest.fn(),
  getOrgBillingSummary: jest.fn(),
  getInvoiceDetail: jest.fn(),
  listInvoices: jest.fn(),
  getUsageSummary: jest.fn(),
  getBillingMetrics: jest.fn(),
}));

import { registerBillingAdminRoutes } from '../../../../app/api/build-billing-admin-dashboard/route';
import billingService from '../../../../lib/build-billing-admin-dashboard';

const mockService = billingService as any;

const mockOrgId = 'org-123';
const mockUserId = 'user-123';

describe('Billing Admin Dashboard API', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    jest.clearAllMocks();

    // Auth hook - mimics global auth + orgGuard (simplified)
    fastify.addHook('preHandler', async (request, reply) => {
      const orgId = request.headers['x-org-id'] as string | undefined;
      const role = (request.headers['x-user-role'] as string) || 'USER';
      const userId = request.headers['x-user-id'] as string;

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      if (!orgId && role !== 'SUPER_ADMIN') {
        reply.code(400).send({ error: 'Missing x-org-id' });
        return;
      }

      (request as any).user = { id: userId, role, orgId };
    });

    await fastify.register(registerBillingAdminRoutes, { prefix: '/admin/billing' });
  });

  describe('GET /admin/billing/overview', () => {
    it('should return billing overview for SUPER_ADMIN', async () => {
      mockService.getBillingOverview.mockResolvedValue({
        totalRevenueCents: 500000,
        pendingRevenueCents: 50000,
        overdueInvoicesCount: 5,
        totalInvoicesCount: 100,
        paidInvoicesCount: 75,
        activeOrganizationsCount: 10,
        averageInvoiceAmountCents: 5000,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/overview',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.totalRevenueCents).toBe(500000);
      expect(mockService.getBillingOverview).toHaveBeenCalled();
    });

    it('should allow ORG_ADMIN to view overview (restricted data)', async () => {
      mockService.getBillingOverview.mockResolvedValue({
        totalRevenueCents: 0,
        pendingRevenueCents: 0,
        overdueInvoicesCount: 0,
        totalInvoicesCount: 0,
        paidInvoicesCount: 0,
        activeOrganizationsCount: 0,
        averageInvoiceAmountCents: 0,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/overview',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': mockOrgId,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 403 for non-admin user', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/overview',
        headers: {
          'x-user-role': 'USER',
          'x-user-id': 'user-1',
          'x-org-id': mockOrgId,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /admin/billing/organizations', () => {
    it('should return org summaries for SUPER_ADMIN', async () => {
      mockService.getOrgBillingSummary.mockResolvedValue([
        {
          orgId: 'org-1',
          orgName: 'Acme Corp',
          plan: 'PRO',
          email: 'billing@acme.com',
          totalInvoicedCents: 100000,
          totalPaidCents: 80000,
          outstandingBalanceCents: 20000,
          lastInvoiceDate: new Date('2025-04-01'),
          taxRate: 7.5,
          taxName: 'VAT',
          taxId: 'VAT123',
          invoiceCount: 5,
        },
      ]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/organizations',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].orgName).toBe('Acme Corp');
    });

    it('should filter to own org for ORG_ADMIN', async () => {
      mockService.getOrgBillingSummary.mockResolvedValue([
        {
          orgId: 'org-other',
          orgName: 'Other Corp',
          plan: 'STARTER',
          email: null,
          totalInvoicedCents: 0,
          totalPaidCents: 0,
          outstandingBalanceCents: 0,
          lastInvoiceDate: null,
          taxRate: null,
          taxName: null,
          taxId: null,
          invoiceCount: 0,
        },
      ]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/organizations',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': 'org-mine',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Handler filters to own org; returned list from service has different org -> empty
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /admin/billing/invoices', () => {
    it('should list invoices with optional filters', async () => {
      mockService.listInvoices.mockResolvedValue({
        data: [
          {
            id: 'inv-1',
            number: 'INV-001',
            orgId: mockOrgId,
            orgName: 'Acme Corp',
            stripeInvoiceId: 'pay-1',
            amountCents: 10000,
            currency: 'USD',
            status: 'PAID',
            periodStart: new Date('2025-03-01'),
            periodEnd: new Date('2025-03-31'),
            dueDate: new Date('2025-04-15'),
            paidAt: new Date('2025-04-10'),
            createdAt: new Date('2025-04-01'),
            items: [],
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/invoices?orgId=org-123&status=PAID&limit=10&offset=0',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.total).toBe(1);
      expect(body.data.data).toHaveLength(1);
      expect(body.data.hasMore).toBe(false);
    });

    it('should support pagination', async () => {
      mockService.listInvoices.mockResolvedValue({
        data: Array(2).fill(null).map((_, i) => ({
          id: `inv-${i+1}`,
          orgId: mockOrgId,
          number: `INV-${String(i+1).padStart(3, '0')}`,
          amountCents: 10000,
          currency: 'USD',
          status: 'PAID',
          periodStart: new Date('2025-03-01'),
          periodEnd: new Date('2025-03-31'),
          dueDate: new Date('2025-04-15'),
          paidAt: new Date('2025-04-10'),
          createdAt: new Date(`2025-04-${i+1}`),
          items: [],
          orgName: 'Acme Corp',
        })),
        total: 5,
        limit: 2,
        offset: 0,
        hasMore: true,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/invoices?limit=2&offset=0',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.data.data).toHaveLength(2);
      expect(body.data.hasMore).toBe(true);
      expect(body.data.total).toBe(5);
    });
  });

  describe('GET /admin/billing/invoices/:invoiceId', () => {
    it('should return invoice detail with items', async () => {
      mockService.getInvoiceDetail.mockResolvedValue({
        id: 'inv-1',
        number: 'INV-001',
        orgId: mockOrgId,
        orgName: 'Acme Corp',
        stripeInvoiceId: 'pay-1',
        amountCents: 10000,
        currency: 'USD',
        status: 'PAID',
        periodStart: new Date('2025-03-01'),
        periodEnd: new Date('2025-03-31'),
        dueDate: new Date('2025-04-15'),
        paidAt: new Date('2025-04-10'),
        createdAt: new Date('2025-04-01'),
        items: [
          {
            id: 'item-1',
            description: 'Overage - api_requests',
            quantity: 1,
            unitPriceCents: 10000,
            totalCents: 10000,
          },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/invoices/inv-1',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].description).toBe('Overage - api_requests');
    });

    it('should return 404 if invoice not found', async () => {
      mockService.getInvoiceDetail.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/invoices/nonexistent',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should enforce org isolation for ORG_ADMIN', async () => {
      mockService.getInvoiceDetail.mockResolvedValue({
        id: 'inv-1',
        orgId: 'org-other',
        orgName: 'Other Corp',
        number: 'INV-001',
        amountCents: 10000,
        currency: 'USD',
        status: 'PAID',
        periodStart: new Date(),
        periodEnd: new Date(),
        dueDate: new Date(),
        paidAt: new Date(),
        createdAt: new Date(),
        items: [],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/invoices/inv-1',
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': 'org-mine',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /admin/billing/usage', () => {
    it('should require orgId parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/billing/usage',
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Missing required parameter: orgId');
    });

    it('should return usage summary', async () => {
      mockService.getUsageSummary.mockResolvedValue([
        {
          orgId: mockOrgId,
          orgName: 'Acme Corp',
          meterName: 'api_requests',
          periodStart: new Date('2025-04-01'),
          periodEnd: new Date('2025-04-30'),
          totalUsage: 150000,
          includedUnits: 100000,
          overageUnits: 50000,
          overageChargesCents: 100000,
          quotaPercentage: 150,
        },
      ]);

      const response = await fastify.inject({
        method: 'GET',
        url: `/admin/billing/usage?orgId=${mockOrgId}`,
        headers: {
          'x-user-role': 'SUPER_ADMIN',
          'x-user-id': 'admin-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].totalUsage).toBe(150000);
      expect(mockService.getUsageSummary).toHaveBeenCalledWith(mockOrgId, undefined);
    });

    it('should enforce org isolation for ORG_ADMIN', async () => {
      mockService.getUsageSummary.mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: `/admin/billing/usage?orgId=different-org`,
        headers: {
          'x-user-role': 'ORG_ADMIN',
          'x-user-id': 'org-admin',
          'x-org-id': mockOrgId,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  // TODO: Add tests for refreshInvoiceHandler once we confirm it works correctly
});
