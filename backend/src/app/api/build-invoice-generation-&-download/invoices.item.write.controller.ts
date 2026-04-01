/**
 * Invoice API - Item Write Controllers (Finalize, Void, Delete)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import {
  finalizeInvoice,
  voidInvoice,
  deleteInvoice,
  getInvoiceWithItems,
} from '../../../lib/build-invoice-generation-&-download';
import { finalizeBodySchema, voidInvoiceBodySchema } from './schemas';

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
