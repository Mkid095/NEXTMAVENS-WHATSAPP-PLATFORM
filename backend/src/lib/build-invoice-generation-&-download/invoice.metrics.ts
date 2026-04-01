/**
 * Invoice Service - Metrics
 * Prometheus metrics for invoice operations
 */

import { Counter, Histogram } from 'prom-client';

/**
 * Total number of invoices finalized and PDF generated
 */
export const invoiceGeneratedTotal = new Counter({
  name: 'whatsapp_platform_invoice_generated_total',
  help: 'Total number of invoices finalized and PDF generated',
  labelNames: ['org_id'],
});

/**
 * Total number of invoice PDF downloads
 */
export const invoiceDownloadTotal = new Counter({
  name: 'whatsapp_platform_invoice_download_total',
  help: 'Total number of invoice PDF downloads',
  labelNames: ['org_id'],
});

/**
 * Duration of invoice PDF generation in seconds
 */
export const invoiceGenerationDuration = new Histogram({
  name: 'whatsapp_platform_invoice_generation_duration_seconds',
  help: 'Duration of invoice PDF generation in seconds',
  labelNames: ['org_id'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10],
});
