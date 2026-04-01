/**
 * Invoice Service - Barrel Export
 *
 * Re-exports all invoice-related functionality from specialized modules.
 * Original monolithic file split into smaller focused modules.
 */

// Types
export type { CreateInvoiceInput, InvoiceWithItems } from './invoice.types';

// Metrics
export {
  invoiceGeneratedTotal,
  invoiceDownloadTotal,
  invoiceGenerationDuration,
} from './invoice.metrics';

// CRUD operations
export {
  createInvoice,
  getInvoiceWithItems,
  voidInvoice,
  deleteInvoice,
  listInvoices,
} from './invoice.crud';

// PDF operations
export {
  finalizeInvoice,
  getInvoicePDF,
} from './invoice.pdf.service';

// Re-export PDF utilities from pdf-generator barrel
export { formatCurrency } from './pdf-generator';
