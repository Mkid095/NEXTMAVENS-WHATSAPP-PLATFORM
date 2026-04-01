/**
 * Billing Admin Dashboard - Overview Service
 * Provides high-level billing overview metrics
 */

import { prisma } from '../prisma';

/**
 * Get overall billing overview metrics
 */
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

  // Active organizations (orgs with at least one invoice)
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

/**
 * Health check for billing dashboard service
 */
export function healthCheck(): boolean {
  return true;
}
