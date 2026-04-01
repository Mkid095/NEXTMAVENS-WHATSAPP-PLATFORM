/**
 * Invoice Generation & Download Admin API
 *
 * Endpoints for managing invoice creation, PDF generation, and downloads.
 * Protected by auth + orgGuard middleware.
 *
 * Base path: /admin/invoices
 */

import { FastifyInstance } from 'fastify';

// Import controllers
import {
  createInvoiceHandler,
  listInvoicesHandler,
} from './invoices.collection.controller';
import {
  getInvoiceHandler,
  downloadInvoiceHandler,
} from './invoices.item.read.controller';
import {
  finalizeInvoiceHandler,
  voidInvoiceHandler,
  deleteInvoiceHandler,
} from './invoices.item.write.controller';

export default async function (fastify: FastifyInstance) {
  // Collection endpoints
  fastify.post('/', createInvoiceHandler);
  fastify.get('/', listInvoicesHandler);

  // Item endpoints
  fastify.get('/:id', getInvoiceHandler);
  fastify.delete('/:id', deleteInvoiceHandler);
  fastify.put('/:id/finalize', finalizeInvoiceHandler);
  fastify.get('/:id/download', downloadInvoiceHandler);
  fastify.post('/:id/void', voidInvoiceHandler);
}
