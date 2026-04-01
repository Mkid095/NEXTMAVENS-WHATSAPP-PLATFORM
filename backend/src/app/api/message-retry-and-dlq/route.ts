/**
 * Dead Letter Queue (DLQ) Admin API
 *
 * Endpoints for monitoring, managing, and replaying failed messages.
 * Protected by auth + orgGuard middleware (SUPER_ADMIN only effectively).
 *
 * Base path: /admin/dlq
 *
 * Barrel export - registers routes from handlers and schemas.
 */

import type { FastifyInstance } from 'fastify';
import * as handlers from './handlers';

/**
 * Register all DLQ admin routes
 */
export async function registerDlqAdminRoutes(fastify: FastifyInstance): Promise<void> {
  // Metrics
  fastify.get('/admin/dlq/metrics', handlers.getDlqMetricsHandler);

  // Message management
  fastify.get('/admin/dlq/messages', handlers.listDlqMessagesHandler);
  fastify.get('/admin/dlq/messages/:entryId', handlers.getDlqMessageHandler);
  fastify.post('/admin/dlq/messages/:entryId/retry', handlers.retryDlqMessageHandler);
  fastify.delete('/admin/dlq/messages/:entryId', handlers.deleteDlqMessageHandler);
  fastify.post('/admin/dlq/messages/retry-all', handlers.retryAllDlqMessagesHandler);
  fastify.delete('/admin/dlq/messages', handlers.bulkDeleteDlqMessagesHandler);

  // Stream management
  fastify.get('/admin/dlq/streams', handlers.listDlqStreamsHandler);
  fastify.delete('/admin/dlq/streams/:messageType', handlers.clearDlqStreamHandler);

  console.log('[DLQAdmin] Registered DLQ admin routes under /admin/dlq');
}

export default registerDlqAdminRoutes;
