/**
 * Billing Admin Dashboard - Organizations Service
 * Provides organization-level billing summaries
 */

import { prisma } from '../prisma';
import type { OrgBillingSummary } from './types';

/**
 * Get billing summary for organizations
 */
export async function getOrgBillingSummary(orgId?: string): Promise<OrgBillingSummary[]> {
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
