/**
 * Billing Admin Dashboard API
 * Endpoints for administrators to view billing data, revenue reports, and organization summaries
 * Base path: /admin/billing
 *
 * Protected by auth + orgGuard middleware. Requires SUPER_ADMIN or ORG_ADMIN role.
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { prisma } from '../../../lib/prisma';
import {
  getBillingOverview,
  getOrgBillingSummary,
  getInvoiceDetail,
  listInvoices,
  getUsageSummary,
  getBillingMetrics,
} from '../../../lib/build-billing-admin-dashboard';
import { generatePeriodInvoice } from '../../../lib/implement-usage-based-billing-&-overage';

// ============================================================================
// Validation Schemas
// ============================================================================

const invoiceFilterSchema = z.object({
  orgId: z.string().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

const usageSummarySchema = z.object({
  orgId: z.string().min(1),
  meterName: z.string().optional().default('api_requests'),
});

const refreshInvoiceBodySchema = z.object({
  meterName: z.string().optional().default('api_requests'),
});

// ============================================================================
// Authorization Helper
// ============================================================================

function isAuthorized(request: FastifyRequest, resourceOrgId?: string): boolean {
  const userRole = (request as any).user?.role;
  const userOrgId = (request as any).user?.orgId;

  if (!userRole) return false;

  if (userRole === 'SUPER_ADMIN') return true;

  if (userRole === 'ORG_ADMIN' && userOrgId) {
    // ORG_ADMIN can only access their own org
    if (resourceOrgId && resourceOrgId !== userOrgId) return false;
    return true;
  }

  return false;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /admin/billing/overview
 * Get overall billing metrics and revenue summary
 */
export async function getBillingOverviewHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isAuthorized(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Admin access required' };
    }

    const overview = await getBillingOverview();
    return { success: true, data: overview };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /admin/billing/organizations
 * Get billing summaries for all organizations or a specific one
 */
export async function getOrganizationsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userRole = (request as any).user?.role;
    const userOrgId = (request as any).user?.orgId;

    if (!isAuthorized(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Admin access required' };
    }

    // If ORG_ADMIN, automatically filter to their own org (ignore query param)
    const orgId = userRole === 'ORG_ADMIN' ? userOrgId : (request.query as any).orgId as string | undefined;

    const summaries = await getOrgBillingSummary(orgId);

    // If ORG_ADMIN and requested different org, filter results to own org
    const filteredSummaries = userRole === 'ORG_ADMIN' ? summaries.filter((s) => s.orgId === userOrgId) : summaries;

    return { success: true, data: filteredSummaries };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /admin/billing/invoices
 * List invoices with optional filters
 */
export async function listInvoicesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isAuthorized(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Admin access required' };
    }

    const query = request.query as any;
    const filter: any = {};

    if (query.orgId) filter.orgId = query.orgId;
    if (query.status) filter.status = query.status;
    if (query.dateFrom) filter.dateFrom = new Date(query.dateFrom);
    if (query.dateTo) filter.dateTo = new Date(query.dateTo);
    filter.limit = query.limit;
    filter.offset = query.offset;

    const result = await listInvoices(filter);
    return { success: true, data: result };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /admin/billing/invoices/:invoiceId
 * Get detailed invoice with line items
 */
export async function getInvoiceDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isAuthorized(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Admin access required' };
    }

    const { invoiceId } = request.params as { invoiceId: string };
    const invoice = await getInvoiceDetail(invoiceId);

    if (!invoice) {
      reply.code(404);
      return { success: false, error: 'Invoice not found' };
    }

    // ORG_ADMIN can only view their own org's invoices
    const userRole = (request as any).user?.role;
    const userOrgId = (request as any).user?.orgId;
    if (userRole === 'ORG_ADMIN' && invoice.orgId !== userOrgId) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Can only access your organization\'s invoices' };
    }

    return { success: true, data: invoice };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /admin/billing/usage
 * Get usage summary for an organization
 */
export async function getUsageSummaryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isAuthorized(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Admin access required' };
    }

    const query = request.query as any;
    const { orgId, meterName } = query;

    if (!orgId) {
      reply.code(400);
      return { success: false, error: 'Missing required parameter: orgId' };
    }

    // ORG_ADMIN can only view their own org's usage
    const userRole = (request as any).user?.role;
    const userOrgId = (request as any).user?.orgId;
    if (userRole === 'ORG_ADMIN' && orgId !== userOrgId) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Can only access your organization\'s usage' };
    }

    const usage = await getUsageSummary(orgId, meterName);
    return { success: true, data: usage };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * POST /admin/billing/invoices/:invoiceId/refresh
 * Regenerate a payment request for an invoice from current usage data
 * Only works for invoices that are not PAID
 */
export async function refreshInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isAuthorized(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Admin access required' };
    }

    const { invoiceId } = request.params as { invoiceId: string };
    const body = refreshInvoiceBodySchema.parse(request.body);
    const { meterName } = body;

    // Get the invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { org: true },
    });

    if (!invoice) {
      reply.code(404);
      return { success: false, error: 'Invoice not found' };
    }

    // ORG_ADMIN can only refresh their own org's invoices
    const userRole = (request as any).user?.role;
    const userOrgId = (request as any).user?.orgId;
    if (userRole === 'ORG_ADMIN' && invoice.orgId !== userOrgId) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Can only refresh your organization\'s invoices' };
    }

    // Can only refresh non-paid invoices
    if (invoice.status === 'PAID') {
      reply.code(400);
      return { success: false, error: 'Cannot refresh a paid invoice' };
    }

    // Generate new overage invoice via usage service (creates Paystack payment request)
    const result = await generatePeriodInvoice(invoice.orgId, meterName);

    return {
      success: true,
      data: {
        invoiceId,
        message: result.message || 'Invoice refreshed',
        paymentRequestId: result.paymentRequestId,
        requestCode: result.requestCode,
        amountKobo: result.amountKobo,
      },
    };
  } catch (error: any) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      reply.code(400);
      return { success: false, error: 'Invalid input: meterName must be a non-empty string' };
    }
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

/**
 * GET /admin/billing/metrics
 * Get billing metrics and charts data
 */
export async function getBillingMetricsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isAuthorized(request)) {
      reply.code(403);
      return { success: false, error: 'Forbidden: Admin access required' };
    }

    const metrics = await getBillingMetrics();
    return { success: true, data: metrics };
  } catch (error: any) {
    reply.code(500);
    return { success: false, error: error.message || 'Internal server error' };
  }
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerBillingAdminRoutes(app: any, options: { prefix?: string } = {}) {
  const prefix = options.prefix || '/admin/billing';

  // Overview
  app.get('/overview', getBillingOverviewHandler);
  app.get('/metrics', getBillingMetricsHandler);

  // Organizations
  app.get('/organizations', getOrganizationsHandler);

  // Invoices
  app.get('/invoices', listInvoicesHandler);
  app.get('/invoices/:invoiceId', getInvoiceDetailHandler);
  app.post('/invoices/:invoiceId/refresh', refreshInvoiceHandler);

  // Usage
  app.get('/usage', getUsageSummaryHandler);
}
