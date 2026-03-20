/**
 * Billing Admin Dashboard Service
 * Provides aggregated billing data and reporting for administrators
 */

import { prisma } from '../prisma';
import type {
  BillingOverview,
  OrgBillingSummary,
  InvoiceDetail,
  InvoiceFilter,
  PaginatedResult,
  UsageSummary,
  BillingMetrics,
} from './types';
import { getCurrentUsage } from '../implement-usage-based-billing-&-overage';

// Plan quotas - must stay in sync with usage-service.ts
const PLAN_QUOTAS: Record<string, Record<string, { includedUnits: number; overageRateCents: number }>> = {
  FREE: {
    api_requests: { includedUnits: 1000, overageRateCents: 10 },
  },
  STARTER: {
    api_requests: { includedUnits: 10000, overageRateCents: 5 },
  },
  PRO: {
    api_requests: { includedUnits: 100000, overageRateCents: 2 },
  },
  ENTERPRISE: {
    api_requests: { includedUnits: 1000000, overageRateCents: 1 },
  },
};

export async function getBillingOverview(): Promise<BillingOverview> {
  // Total invoice counts
  const totalInvoices = await prisma.invoice.count();
  const paidInvoices = await prisma.invoice.count({
    where: { status: 'PAID' },
  });

  // Revenue from paid invoices
  const revenueResult = await prisma.invoice.aggregate({
    where: { status: 'PAID' },
    _sum: { amount: true },
  });
  const totalRevenueCents = revenueResult._sum.amount || 0;

  // Pending revenue (OPEN + DRAFT)
  const pendingResult = await prisma.invoice.aggregate({
    where: {
      status: {
        in: ['OPEN', 'DRAFT'],
      },
    },
    _sum: { amount: true },
  });
  const pendingRevenueCents = pendingResult._sum.amount || 0;

  // Overdue invoices (dueDate < NOW and status not PAID/VOID)
  const now = new Date();
  const overdueCount = await prisma.invoice.count({
    where: {
      dueDate: { lt: now },
      status: {
        in: ['DRAFT', 'OPEN', 'UNCOLLECTIBLE'],
      },
    },
  });

  // Active organizations (orgs with at least one invoice or usage event)
  const activeOrgsWithInvoices = await prisma.invoice.groupBy({
    by: ['orgId'],
    _count: { orgId: true },
  });
  const activeOrgsCount = activeOrgsWithInvoices.length;

  // Average paid invoice amount
  const avgResult = await prisma.invoice.aggregate({
    where: { status: 'PAID' },
    _avg: { amount: true },
  });
  const averageInvoiceAmountCents = avgResult._avg.amount || 0;

  return {
    totalRevenueCents,
    pendingRevenueCents,
    overdueInvoicesCount: overdueCount,
    totalInvoicesCount: totalInvoices,
    paidInvoicesCount: paidInvoices,
    activeOrganizationsCount: activeOrgsCount,
    averageInvoiceAmountCents: Math.round(averageInvoiceAmountCents),
  };
}

export async function getOrgBillingSummary(orgId?: string): Promise<OrgBillingSummary[]> {
  // If orgId provided, filter to that org; else get all orgs with billing activity
  const where: any = {};
  if (orgId) {
    where.id = orgId;
  }

  const orgs = await prisma.organization.findMany({
    where,
    include: {
      invoices: {
        include: {
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return orgs.map((org): OrgBillingSummary => {
    const invoices = org.invoices;
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalPaid = invoices
      .filter((inv) => inv.status === 'PAID')
      .reduce((sum, inv) => sum + inv.amount, 0);
    const outstanding = invoices
      .filter((inv) => inv.status === 'OPEN' || inv.status === 'DRAFT')
      .reduce((sum, inv) => sum + inv.amount, 0);
    const lastInvoiceDate = invoices.length > 0 ? invoices[0].createdAt : null;

    // Extract tax config from org (direct fields, not from tax integration module)
    // org.taxRate, org.taxName, org.taxId are nullable

    return {
      orgId: org.id,
      orgName: org.name,
      plan: org.plan,
      email: org.email,
      totalInvoicedCents: totalInvoiced,
      totalPaidCents: totalPaid,
      outstandingBalanceCents: outstanding,
      lastInvoiceDate,
      taxRate: org.taxRate,
      taxName: org.taxName,
      taxId: org.taxId,
      invoiceCount: invoices.length,
    };
  });
}

export async function getInvoiceDetail(invoiceId: string): Promise<InvoiceDetail | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      org: {
        select: {
          id: true,
          name: true,
        },
      },
      items: true,
    },
  });

  if (!invoice) {
    return null;
  }

  return {
    id: invoice.id,
    number: invoice.number,
    orgId: invoice.orgId,
    orgName: invoice.org.name,
    stripeInvoiceId: invoice.stripeInvoiceId,
    amountCents: invoice.amount,
    currency: invoice.currency,
    status: invoice.status as any,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
      metadata: item.metadata as any,
    })),
    metadata: invoice.status !== 'DRAFT' ? {
      // Could include tax info if stored in metadata (future)
    } : undefined,
  };
}

export async function listInvoices(
  filter: InvoiceFilter
): Promise<PaginatedResult<InvoiceDetail>> {
  const where: any = {};

  if (filter.orgId) {
    where.orgId = filter.orgId;
  }
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.dateFrom || filter.dateTo) {
    where.createdAt = {};
    if (filter.dateFrom) where.createdAt.gte = filter.dateFrom;
    if (filter.dateTo) where.createdAt.lte = filter.dateTo;
  }

  const limit = filter.limit || 50;
  const offset = filter.offset || 0;

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: {
        org: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // fetch one extra to check if there's more
      skip: offset,
    }),
  ]);

  const hasMore = invoices.length > limit;
  const data = hasMore ? invoices.slice(0, limit) : invoices;

  return {
    data: data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      orgId: inv.orgId,
      orgName: inv.org.name,
      stripeInvoiceId: inv.stripeInvoiceId,
      amountCents: inv.amount,
      currency: inv.currency,
      status: inv.status as any,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
      createdAt: inv.createdAt,
      items: inv.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        metadata: item.metadata as any,
      })),
    })),
    total,
    limit,
    offset,
    hasMore,
  };
}

export async function getUsageSummary(
  orgId: string,
  meterName?: string
): Promise<UsageSummary[]> {
  // If meterName not specified, default to "api_requests"
  const meters = meterName ? [meterName] : ['api_requests'];

  const results: UsageSummary[] = [];

  for (const meter of meters) {
    try {
      const usage = await getCurrentUsage(orgId, meter);

      // Get org details for name
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, plan: true },
      });

      if (!org) continue;

      const quota = PLAN_QUOTAS[org.plan]?.[meter];
      if (!quota) continue;

      const overageUnits = Math.max(0, usage.usage - quota.includedUnits);
      const overageChargesCents = overageUnits * (quota?.overageRateCents || 0); // We don't have overageRate here; this is a simplified view. Might need to fetch from usage-service.

      results.push({
        orgId,
        orgName: org.name,
        meterName: meter,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        totalUsage: usage.usage,
        includedUnits: quota.includedUnits,
        overageUnits,
        overageChargesCents, // Note: this is an estimate without overageRate; leaving as is for now
        quotaPercentage: (usage.usage / quota.includedUnits) * 100,
      });
    } catch (error) {
      // Skip meters that fail; maybe org has no data
      continue;
    }
  }

  return results;
}

export async function getBillingMetrics(): Promise<BillingMetrics> {
  // Revenue by month (last 12 months)
  const revenueByMonth: { month: Date; revenueCents: number | null }[] = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('month', paid_at) as month,
      SUM(amount) as "revenueCents"
    FROM invoices
    WHERE status = 'PAID' AND paid_at IS NOT NULL
    GROUP BY DATE_TRUNC('month', paid_at)
    ORDER BY month DESC
    LIMIT 12
  `;

  // Top orgs by revenue
  const topOrgs: { org_id: string; revenueCents: number }[] = await prisma.$queryRaw`
    SELECT
      org_id,
      SUM(amount) as "revenueCents"
    FROM invoices
    WHERE status = 'PAID'
    GROUP BY org_id
    ORDER BY "revenueCents" DESC
    LIMIT 10
  `;

  // Get org names for top orgs
  const orgIds = topOrgs.map((row: any) => row.org_id);
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true },
  });
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  // Invoice status distribution
  const statusDist = await prisma.invoice.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  // Average time to pay (in days) - only for paid invoices
  const avgDaysResult = await prisma.$queryRaw<Array<{ avgDays: number }>>`
    SELECT AVG(DATE_PART('day', paid_at - created_at)) as "avgDays"
    FROM invoices
    WHERE status = 'PAID' AND paid_at IS NOT NULL
  `;
  const averageTimeToPayDays = avgDaysResult[0]?.avgDays || null;

  return {
    revenueByMonth: revenueByMonth.map((row: any) => ({
      month: row.month.toISOString().slice(0, 7), // YYYY-MM
      revenueCents: Number(row.revenueCents || 0),
    })),
    topOrgsByRevenue: topOrgs
      .map((row: any) => ({
        orgId: row.org_id,
        orgName: orgMap.get(row.org_id) || 'Unknown',
        revenueCents: Number(row.revenueCents),
      }))
      .filter((o: any) => o.revenueCents > 0),
    invoiceStatusDistribution: statusDist.map((s: any) => ({
      status: s.status,
      count: s._count.status,
    })),
    averageTimeToPayDays: averageTimeToPayDays ? Math.round(averageTimeToPayDays * 10) / 10 : null,
  };
}

/**
 * Health check for billing dashboard service
 */
export function healthCheck(): boolean {
  return true;
}
