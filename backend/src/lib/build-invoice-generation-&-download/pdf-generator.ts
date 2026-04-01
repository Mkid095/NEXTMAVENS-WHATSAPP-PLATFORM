/**
 * PDF Generator - Barrel Export
 *
 * Re-exports all PDF-related functionality from specialized modules.
 * Original monolithic file split into smaller focused modules.
 */

// Types and defaults
export type { PDFGenerationOptions } from './pdf.types';
export { DEFAULT_OPTIONS } from './pdf.types';

// Formatters
export { formatCurrency, formatDate } from './pdf.formatters';

// Core rendering
export { generateInvoicePDF } from './pdf.renderer';

// Builder utilities
export { generateAndSaveInvoicePDF, getPDFStream } from './pdf.builder';
