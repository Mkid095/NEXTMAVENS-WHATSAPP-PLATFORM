/**
 * PDF Generator - Renderer
 * Core PDF rendering logic using PDFKit
 */

import PDFDocument from 'pdfkit';
import type { Invoice, InvoiceItem } from '@prisma/client';
import { formatCurrency, formatDate } from './pdf.formatters';
import { DEFAULT_OPTIONS } from './pdf.types';

/**
 * Generate PDF buffer for an invoice
 */
export async function generateInvoicePDF(
  invoice: Invoice,
  items: InvoiceItem[],
  options: import('./pdf.types').PDFGenerationOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Create PDF document in memory
  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: 50,
      bottom: 50,
      left: 50,
      right: 50,
    },
  });

  // Collect chunks into buffer
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // ┌─────────────────────────────────────────────────────────────┐
  // │ Header Section                                             │
  // └─────────────────────────────────────────────────────────────┘
  doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'right' });

  // Invoice number and date
  doc.fontSize(10).font('Helvetica').text(`Invoice #: ${invoice.number}`, { align: 'right' });
  doc.fontSize(10).font('Helvetica').text(`Date: ${formatDate(invoice.createdAt)}`, { align: 'right' });
  if (invoice.dueDate) {
    doc.fontSize(10).font('Helvetica').text(`Due: ${formatDate(invoice.dueDate)}`, { align: 'right' });
  }
  doc.moveDown(1);

  // Company info (left)
  doc.fontSize(12).font('Helvetica-Bold').text(opts.companyName);
  if (opts.companyAddress) {
    doc.fontSize(10).font('Helvetica').text(opts.companyAddress);
  }
  doc.moveDown(1);

  // Bill To section
  doc.fontSize(12).font('Helvetica-Bold').text('Bill To:');
  doc.fontSize(10).font('Helvetica').text(`Organization ID: ${invoice.orgId}`);
  if (invoice.stripeInvoiceId) {
    doc.fontSize(10).font('Helvetica').text(`Stripe Invoice: ${invoice.stripeInvoiceId}`);
  }
  doc.moveDown(2);

  // ┌─────────────────────────────────────────────────────────────┐
  // │ Line Items Table                                           │
  // └─────────────────────────────────────────────────────────────┘

  // Table data
  const tableData: any[][] = [
    [
      { text: 'Qty', border: [false, false, true, false], bold: true, fillColor: '#f0f0f0' },
      { text: 'Description', border: [false, false, true, false], bold: true, fillColor: '#f0f0f0' },
      { text: 'Unit Price', border: [false, false, true, false], bold: true, fillColor: '#f0f0f0', align: 'right' },
      { text: 'Total', border: [false, false, true, false], bold: true, fillColor: '#f0f0f0', align: 'right' },
    ],
  ];

  for (const item of items) {
    const unitPrice = formatCurrency(item.unitPriceCents, invoice.currency);
    const total = formatCurrency(item.totalCents, invoice.currency);
    tableData.push([
      item.quantity.toString(),
      item.description,
      unitPrice,
      total,
    ]);
  }

  // Render table
  doc.table({
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    columnStyles: [40, '*', 80, 80],
    data: tableData,
    rowStyles: {
      0: {
        fillColor: '#f5f5f5',
        border: [false, false, 2, false],
      },
    },
  });

  doc.moveDown(1);

  // ┌─────────────────────────────────────────────────────────────┐
  // │ Totals                                                     │
  // └─────────────────────────────────────────────────────────────┘
  const totalsX = doc.page.width - doc.page.margins.right - 150;
  const totalsWidth = 150;

  doc.fontSize(10).font('Helvetica');

  // Subtotal (items total)
  const subtotal = items.reduce((sum, item) => sum + item.totalCents, 0);
  doc.text(`Subtotal: ${formatCurrency(subtotal, invoice.currency)}`, totalsX, doc.y, { width: totalsWidth, align: 'right' });

  // Total (from invoice)
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica-Bold');
  doc.text(`Total: ${formatCurrency(invoice.amount, invoice.currency)}`, totalsX, doc.y, { width: totalsWidth, align: 'right' });

  doc.moveDown(2);

  // ┌─────────────────────────────────────────────────────────────┐
  // │ Footer                                                     │
  // └─────────────────────────────────────────────────────────────┘
  const footer = opts.footerText || DEFAULT_OPTIONS.footerText;
  if (footer) {
    doc.fontSize(9).font('Helvetica');
    doc.text(footer, { align: 'center', width: doc.page.width - 100 });
    doc.moveDown(1);
  }

  // Payment status
  if (invoice.status === 'OPEN') {
    doc.fontSize(10).font('Helvetica-Bold').text('Payment Instructions:', { align: 'left' });
    doc.fontSize(9).font('Helvetica').text('Please pay by the due date.', { align: 'left' });
    if (invoice.stripeInvoiceId) {
      doc.fontSize(9).font('Helvetica').text(`Pay online: https://pay.stripe.com/invoice/${invoice.stripeInvoiceId}`, { align: 'left' });
    }
  } else if (invoice.status === 'PAID') {
    doc.fontSize(14).font('Helvetica-Bold').text('PAID', { align: 'center' });
  } else if (invoice.status === 'VOID') {
    doc.fontSize(14).font('Helvetica-Bold').text('VOID', { align: 'center' });
  }

  // Finalize
  doc.end();

  return await finished;
}
