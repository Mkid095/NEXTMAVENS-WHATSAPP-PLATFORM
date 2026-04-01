/**
 * Invoice API - Collection Controllers (List & Create)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import {
  createInvoice,
  listInvoices,
} from '../../../lib/build-invoice-generation-&-download';
import { createInvoiceBodySchema, listInvoicesQuerySchema } from './schemas';

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
