/**
 * PDF Generator - Builder Utilities
 * Functions for saving and streaming PDFs
 */

import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import type { Invoice, InvoiceItem } from '@prisma/client';
import { generateInvoicePDF } from './pdf.renderer';
import type { PDFGenerationOptions } from './pdf.types';

/**
 * Generate PDF and save to storage
 * Returns the file path where PDF was saved
 */
export async function generateAndSaveInvoicePDF(
  invoice: Invoice,
  items: InvoiceItem[],
  storagePath: string,
  options: PDFGenerationOptions = {}
): Promise<string> {
  const pdfBuffer = await generateInvoicePDF(invoice, items, options);

  // Ensure directory exists
  try {
    fs.mkdirSync(storagePath, { recursive: true });
  } catch {
    // May already exist
  }

  const filePath = path.join(storagePath, `${invoice.id}.pdf`);
  fs.writeFileSync(filePath, pdfBuffer);

  return filePath;
}

/**
 * Helper to get output stream for direct HTTP response
 * (Note: This is a simplified version; in production you'd pipe directly)
 */
export function getPDFStream(
  invoice: Invoice,
  items: InvoiceItem[],
  options: PDFGenerationOptions = {}
): any {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });

  // Note: For actual streaming, you would pipe to response directly
  return doc;
}
