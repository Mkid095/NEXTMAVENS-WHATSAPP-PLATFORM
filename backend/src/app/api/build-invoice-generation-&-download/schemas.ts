/**
 * Invoice Generation & Download API - Zod Schemas
 */

import { z } from 'zod';

/**
 * Invoice line item schema
 */
export const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
});

/**
 * Create invoice request schema
 */
export const createInvoiceBodySchema = z.object({
  orgId: z.string().min(1),
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email(),
  stripeInvoiceId: z.string().optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  dueDate: z.string().datetime(),
  currency: z.string().default('USD'),
  status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID']).default('DRAFT'),
  notes: z.string().max(2000).optional(),
  footerText: z.string().max(1000).optional(),
  lineItems: z.array(invoiceItemSchema).min(1).max(100),
});

/**
 * Finalize invoice request schema
 */
export const finalizeBodySchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  companyAddress: z.string().max(500).optional(),
  logoPath: z.string().optional(),
  footerText: z.string().max(1000).optional(),
});

/**
 * List invoices query schema
 */
export const listInvoicesQuerySchema = z.object({
  orgId: z.string().min(1),
  status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']).optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

/**
 * Void invoice request schema
 */
export const voidInvoiceBodySchema = z.object({
  reason: z.string().max(1000).optional(),
});
