/**
 * Invoice Service - PDF Operations
 * PDF generation and retrieval for invoices
 */

import { prisma } from '../prisma';
import { getInvoiceWithItems } from './invoice.crud';
import { generateInvoicePDF, generateAndSaveInvoicePDF } from './pdf-generator';
import { getDefaultStorage } from './storage';
import { invoiceGenerationDuration, invoiceGeneratedTotal, invoiceDownloadTotal } from './invoice.metrics';
import * as path from 'path';
import type { InvoiceWithItems } from './invoice.types';

/**
 * Finalize invoice and generate PDF
 */
export async function finalizeInvoice(
  invoiceId: string,
  options: {
    companyName?: string;
    companyAddress?: string;
    logoPath?: string;
    footerText?: string;
  } = {}
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
  const storagePath =
    process.env.INVOICE_STORAGE_PATH || path.join(process.cwd(), 'storage', 'invoices');
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
export async function getInvoicePDF(
  invoiceId: string
): Promise<{ buffer: Buffer; invoice: InvoiceWithItems } | null> {
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
