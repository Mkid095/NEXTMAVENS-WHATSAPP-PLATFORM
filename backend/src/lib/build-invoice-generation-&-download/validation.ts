/**
 * Validation Schemas for Invoice Generation & Download
 * Using Zod for runtime type safety
 */

import { z } from 'zod';

const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
});

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
  lineItems: z.array(invoiceItemSchema).min(1).max(100), // Max 100 line items
});

// Alias for backwards compatibility (if needed)
export const createInvoiceSchema = createInvoiceBodySchema;

export const finalizeBodySchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  companyAddress: z.string().max(500).optional(),
  logoPath: z.string().optional(),
  footerText: z.string().max(1000).optional(),
});

// Alias for consistency
export const finalizeInvoiceSchema = finalizeBodySchema;

export const listInvoicesQuerySchema = z.object({
  orgId: z.string().min(1),
  status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']).optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const voidInvoiceBodySchema = z.object({
  reason: z.string().max(1000).optional(),
});

// Alias for consistency
export const voidInvoiceSchema = voidInvoiceBodySchema;
