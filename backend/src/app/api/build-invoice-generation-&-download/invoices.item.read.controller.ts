/**
 * Invoice API - Item Read Controllers (Get & Download)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getInvoiceWithItems, getInvoicePDF } from '../../../lib/build-invoice-generation-&-download';

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
