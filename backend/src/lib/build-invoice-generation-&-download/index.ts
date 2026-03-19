/**
 * Invoice Generation & Download Library
 * Phase 3, Step 4: Build Invoice Generation & Download
 *
 * Provides PDF generation, storage, and management for invoices.
 *
 * Usage:
 *   import { createInvoice, finalizeInvoice, getInvoicePDF } from './build-invoice-generation-&-download';
 *
 *   // Create invoice
 *   const invoice = await createInvoice({
 *     orgId: 'org-123',
 *     customerName: 'Acme Corp',
 *     customerEmail: 'billing@example.com',
 *     periodStart: new Date('2025-01-01'),
 *     periodEnd: new Date('2025-01-31'),
 *     dueDate: new Date('2025-02-15'),
 *     lineItems: [...],
 *   });
 *
 *   // Finalize and generate PDF
 *   const finalized = await finalizeInvoice(invoice.id);
 *
 *   // Download PDF
 *   const { buffer } = await getInvoicePDF(invoice.id);
 */

export * from './pdf-generator';
export * from './storage';
export * from './invoice-service';
export * from './validation';

// Re-export types for convenience
export type { CreateInvoiceInput, InvoiceWithItems } from './invoice-service';
export type { PDFGenerationOptions } from './pdf-generator';
export type { StorageBackend, FilesystemStorageBackend } from './storage';
