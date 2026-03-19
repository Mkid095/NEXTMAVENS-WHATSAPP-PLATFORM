/**
 * Invoice Generation & Download Admin API
 *
 * Endpoints for managing invoice creation, PDF generation, and downloads.
 * Protected by auth + orgGuard middleware.
 *
 * Base path: /admin/invoices
 */

import { z, ZodError } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createInvoice,
  getInvoiceWithItems,
  finalizeInvoice,
  getInvoicePDF,
  listInvoices,
  voidInvoice,
  deleteInvoice,
} from '../../../lib/build-invoice-generation-&-download';

// ============================================================================
// Validation Schemas
// ============================================================================

const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
});

const createInvoiceBodySchema = z.object({
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

const finalizeBodySchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  companyAddress: z.string().max(500).optional(),
  logoPath: z.string().optional(),
  footerText: z.string().max(1000).optional(),
});

const listInvoicesQuerySchema = z.object({
  orgId: z.string().min(1),
  status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']).optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

const voidInvoiceBodySchema = z.object({
  reason: z.string().max(1000).optional(),
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /admin/invoices
 * Create a new invoice (draft or open)
 */
export async function createInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = createInvoiceBodySchema.parse(request.body);
    const userId = (request as any).user?.id;

    if (!userId) {
      reply.code(401);
      return { success: false, error: 'Authentication required' };
    }

    // Convert string dates to Date objects
    const input = {
      ...body,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      dueDate: new Date(body.dueDate),
    };

    const invoice = await createInvoice(input);

    return {
      success: true,
      data: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amount: invoice.amount,
        currency: invoice.currency,
        createdAt: invoice.createdAt,
        itemCount: invoice.items.length,
      },
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[InvoiceAPI] Error creating invoice:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to create invoice',
      details: error.message,
    });
  }
}

/**
 * GET /admin/invoices
 * List invoices with optional filters
 */
export async function listInvoicesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = listInvoicesQuerySchema.parse(request.query);
    const orgId = query.orgId;

    const result = await listInvoices({
      orgId,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      success: true,
      data: {
        invoices: result.invoices.map((inv) => ({
          id: inv.id,
          number: inv.number,
          status: inv.status,
          amount: inv.amount,
          currency: inv.currency,
          dueDate: inv.dueDate,
          paidAt: inv.paidAt,
          createdAt: inv.createdAt,
          itemCount: inv.items.length,
        })),
        total: result.total,
      },
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[InvoiceAPI] Error listing invoices:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to list invoices',
    });
  }
}

/**
 * GET /admin/invoices/:id
 * Get invoice details (without PDF)
 */
export async function getInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const orgId = request.headers['x-org-id'] as string;

    const invoice = await getInvoiceWithItems(id);
    if (!invoice) {
      reply.code(404);
      return { success: false, error: 'Invoice not found' };
    }

    // Enforce org isolation
    if (invoice.orgId !== orgId) {
      reply.code(403);
      return { success: false, error: 'Access denied' };
    }

    return {
      success: true,
      data: {
        id: invoice.id,
        number: invoice.number,
        orgId: invoice.orgId,
        stripeInvoiceId: invoice.stripeInvoiceId,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        pdfUrl: invoice.pdfUrl,
        createdAt: invoice.createdAt,
        items: invoice.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        })),
      },
    };
  } catch (error: any) {
    console.error('[InvoiceAPI] Error fetching invoice:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch invoice',
    });
  }
}

/**
 * PUT /admin/invoices/:id/finalize
 * Finalize draft invoice and generate PDF
 */
export async function finalizeInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const orgId = request.headers['x-org-id'] as string;
    const body = finalizeBodySchema.parse(request.body);

    // Get invoice to check org and status
    const existing = await getInvoiceWithItems(id);
    if (!existing) {
      reply.code(404);
      return { success: false, error: 'Invoice not found' };
    }
    if (existing.orgId !== orgId) {
      reply.code(403);
      return { success: false, error: 'Access denied' };
    }

    const finalized = await finalizeInvoice(id, {
      companyName: body.companyName,
      companyAddress: body.companyAddress,
      logoPath: body.logoPath,
      footerText: body.footerText,
    });

    return {
      success: true,
      data: {
        id: finalized.id,
        number: finalized.number,
        status: finalized.status,
        pdfUrl: finalized.pdfUrl,
      },
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[InvoiceAPI] Error finalizing invoice:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to finalize invoice',
      details: error.message,
    });
  }
}

/**
 * GET /admin/invoices/:id/download
 * Download invoice PDF
 */
export async function downloadInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const orgId = request.headers['x-org-id'] as string;

    const pdfData = await getInvoicePDF(id);
    if (!pdfData) {
      reply.code(404);
      return { success: false, error: 'Invoice PDF not found. Ensure invoice is finalized.' };
    }

    const { buffer, invoice } = pdfData;

    // Enforce org isolation
    if (invoice.orgId !== orgId) {
      reply.code(403);
      return { success: false, error: 'Access denied' };
    }

    // Set response headers for PDF download
    reply.header('Content-Type', 'application/pdf');
    reply.header(
      'Content-Disposition',
      `inline; filename="${invoice.number}.pdf"`
    );
    reply.header('Content-Length', buffer.length.toString());

    return reply.send(buffer);
  } catch (error: any) {
    console.error('[InvoiceAPI] Error downloading invoice:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to download invoice PDF',
    });
  }
}

/**
 * POST /admin/invoices/:id/void
 * Void an invoice (cannot be paid afterwards)
 */
export async function voidInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const orgId = request.headers['x-org-id'] as string;
    const body = voidInvoiceBodySchema.parse(request.body);

    const existing = await getInvoiceWithItems(id);
    if (!existing) {
      reply.code(404);
      return { success: false, error: 'Invoice not found' };
    }
    if (existing.orgId !== orgId) {
      reply.code(403);
      return { success: false, error: 'Access denied' };
    }

    const voided = await voidInvoice(id, body.reason);

    return {
      success: true,
      data: {
        id: voided.id,
        number: voided.number,
        status: voided.status,
      },
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      reply.code(400).send({ success: false, error: 'Validation error', details: error.format() });
      return;
    }
    console.error('[InvoiceAPI] Error voiding invoice:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to void invoice',
    });
  }
}

/**
 * DELETE /admin/invoices/:id
 * Delete invoice (only draft invoices allowed)
 */
export async function deleteInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const orgId = request.headers['x-org-id'] as string;

    const existing = await getInvoiceWithItems(id);
    if (!existing) {
      reply.code(404);
      return { success: false, error: 'Invoice not found' };
    }
    if (existing.orgId !== orgId) {
      reply.code(403);
      return { success: false, error: 'Access denied' };
    }

    if (existing.status !== 'DRAFT') {
      reply.code(400);
      return { success: false, error: 'Only draft invoices can be deleted' };
    }

    await deleteInvoice(id);

    return {
      success: true,
      data: { id, deleted: true },
    };
  } catch (error: any) {
    console.error('[InvoiceAPI] Error deleting invoice:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to delete invoice',
    });
  }
}

// ============================================================================
// Route Registration
// ============================================================================

export async function registerInvoiceRoutes(fastify: any) {
  fastify.post('/', createInvoiceHandler);
  fastify.get('/', listInvoicesHandler);
  fastify.get('/:id', getInvoiceHandler);
  fastify.delete('/:id', deleteInvoiceHandler);
  fastify.put('/:id/finalize', finalizeInvoiceHandler);
  fastify.get('/:id/download', downloadInvoiceHandler);
  fastify.post('/:id/void', voidInvoiceHandler);

  console.log('[InvoiceAPI] Registered invoice generation & download routes under /admin/invoices');
}

export default registerInvoiceRoutes;
