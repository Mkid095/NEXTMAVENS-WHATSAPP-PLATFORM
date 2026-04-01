/**
 * Billing Admin Dashboard - Invoices Service
 * Provides invoice detail and listing functionality
 */

import { prisma } from '../prisma';
import type { InvoiceDetail, InvoiceFilter, PaginatedResult } from './types';

/**
 * Get detailed information for a specific invoice
 */
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

/**
 * List invoices with optional filters and pagination
 */
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
