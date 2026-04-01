/**
 * Invoice Service - CRUD Operations
 * Core database operations for invoices
 */

import { prisma } from '../prisma';
import type { Invoice, InvoiceItem } from '@prisma/client';
import type { InvoiceWithItems } from './invoice.types';

/**
 * Create a new invoice (draft or open)
 */
export async function createInvoice(
  input: import('./invoice.types').CreateInvoiceInput
): Promise<InvoiceWithItems> {
  const { lineItems } = input;

  // Calculate total from line items
  const total = lineItems.reduce((sum, item) => sum + item.totalCents, 0);

  const invoice = await prisma.$transaction(async (tx) => {
    // Create invoice record
    const inv = await tx.invoice.create({
      data: {
        orgId: input.orgId,
        stripeInvoiceId: input.stripeInvoiceId || `manual-${Date.now()}`,
        number: `INV-${Date.now()}`,
        amount: total,
        currency: input.currency || 'USD',
        status: input.status,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        dueDate: input.dueDate,
      },
    });

    // Create invoice items
    for (const item of lineItems) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: inv.id,
          orgId: input.orgId,
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        },
      });
    }

    return inv;
  });

  // Fetch full invoice with items
  return getInvoiceWithItems(invoice.id);
}

/**
 * Get invoice by ID with line items
 */
export async function getInvoiceWithItems(invoiceId: string): Promise<InvoiceWithItems | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: {
        // No explicit order; default insertion order is fine
      },
    },
  });

  return invoice as InvoiceWithItems | null;
}

/**
 * Void an invoice
 */
export async function voidInvoice(
  invoiceId: string,
  _reason?: string
): Promise<InvoiceWithItems> {
  // Note: reason could be stored in audit log separately; Invoice model lacks notes field
  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'VOID',
    },
    include: { items: true },
  });

  return invoice as InvoiceWithItems;
}

/**
 * Delete invoice (only draft invoices)
 */
export async function deleteInvoice(invoiceId: string): Promise<boolean> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) {
    return false;
  }

  if (invoice.status !== 'DRAFT') {
    throw new Error('Only draft invoices can be deleted');
  }

  await prisma.invoice.delete({ where: { id: invoiceId } });
  return true;
}

/**
 * List invoices with filters
 */
export async function listInvoices(filters: {
  orgId: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ invoices: InvoiceWithItems[]; total: number }> {
  const where: any = { orgId: filters.orgId };
  if (filters.status) {
    where.status = filters.status;
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    invoices: invoices as InvoiceWithItems[],
    total,
  };
}
