/**
 * Invoice Service
 * Core business logic for invoice management and PDF generation
 */

import { prisma } from '../prisma';
import type { Invoice, InvoiceItem } from '@prisma/client';
import { generateInvoicePDF, generateAndSaveInvoicePDF } from './pdf-generator';
import { getDefaultStorage } from './storage';
import * as path from 'path';
import { Counter, Histogram } from 'prom-client';

// ============================================================================
// Prometheus Metrics
// ============================================================================

export const invoiceGeneratedTotal = new Counter({
  name: 'whatsapp_platform_invoice_generated_total',
  help: 'Total number of invoices finalized and PDF generated',
  labelNames: ['org_id'],
});

export const invoiceDownloadTotal = new Counter({
  name: 'whatsapp_platform_invoice_download_total',
  help: 'Total number of invoice PDF downloads',
  labelNames: ['org_id'],
});

export const invoiceGenerationDuration = new Histogram({
  name: 'whatsapp_platform_invoice_generation_duration_seconds',
  help: 'Duration of invoice PDF generation in seconds',
  labelNames: ['org_id'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10],
});

export interface CreateInvoiceInput {
  orgId: string;
  customerName: string;
  customerEmail: string;
  stripeInvoiceId?: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  currency?: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID';
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

const storage = getDefaultStorage();

/**
 * Create a new invoice (draft or open)
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceWithItems> {
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
 * Finalize invoice and generate PDF
 */
export async function finalizeInvoice(
  invoiceId: string,
  options: { companyName?: string; companyAddress?: string; logoPath?: string; footerText?: string } = {}
): Promise<InvoiceWithItems> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  if (invoice.status !== 'DRAFT') {
    throw new Error(`Cannot finalize invoice with status: ${invoice.status}`);
  }

  // Generate PDF with duration tracking
  const endTimer = invoiceGenerationDuration.startTimer();
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInvoicePDF(invoice, invoice.items, options);
  } finally {
    endTimer({ org_id: invoice.orgId });
  }

  // Save to storage
  const storagePath = process.env.INVOICE_STORAGE_PATH || path.join(process.cwd(), 'storage', 'invoices');
  const filePath = await getDefaultStorage().saveFile(invoiceId, pdfBuffer, invoice.orgId);

  // Update invoice with pdfUrl and set status to OPEN
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'OPEN',
      pdfUrl: filePath,
    },
  });

  // Record metric
  invoiceGeneratedTotal.inc({ org_id: invoice.orgId });

  return getInvoiceWithItems(updated.id);
}

/**
 * Get invoice PDF buffer
 */
export async function getInvoicePDF(invoiceId: string): Promise<{ buffer: Buffer; invoice: InvoiceWithItems } | null> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice || !invoice.pdfUrl) {
    return null;
  }

  const buffer = await getDefaultStorage().getFile(invoiceId, invoice.orgId);
  if (!buffer) {
    return null;
  }

  // Record download metric
  invoiceDownloadTotal.inc({ org_id: invoice.orgId });

  return { buffer, invoice };
}

/**
 * Void an invoice
 */
export async function voidInvoice(invoiceId: string, _reason?: string): Promise<InvoiceWithItems> {
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

// Export formatCurrency for convenience
export { formatCurrency } from './pdf-generator';
