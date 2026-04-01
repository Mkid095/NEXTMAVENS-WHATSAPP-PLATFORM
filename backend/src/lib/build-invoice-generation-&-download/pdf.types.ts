/**
 * PDF Generator - Types
 * Types and options for PDF generation
 */

import type { Invoice, InvoiceItem } from '@prisma/client';

/**
 * Options for PDF generation
 */
export interface PDFGenerationOptions {
  /** Company name to display in header */
  companyName?: string;
  /** Company address (optional) */
  companyAddress?: string;
  /** Logo image path or URL (optional) */
  logoPath?: string;
  /** Additional footer text (e.g., payment terms) */
  footerText?: string;
}

/**
 * Default options for PDF generation
 */
export const DEFAULT_OPTIONS: Required<PDFGenerationOptions> = {
  companyName: 'NEXTMAVENS',
  companyAddress: '',
  logoPath: '',
  footerText: 'Thank you for your business!',
};
