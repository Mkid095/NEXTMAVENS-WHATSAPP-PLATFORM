/**
 * WhatsApp Instances API Routes
 *
 * Aggregates all instance-related endpoints:
 * - CRUD operations (list, create, get, update, delete)
 * - Connection management (connect, QR code, status, disconnect)
 * - Chat list and message history
 * - Agents management
 * - Webhooks configuration
 *
 * Base path: /api/v1/whatsapp/instances
 *
 * Protected by global auth + orgGuard middleware.
 */

import { FastifyInstance } from 'fastify';

// Import sub-route modules
import crudRoutes from './instance.crud';
import connectionRoutes from './instance.connection';
import chatRoutes from './instance.chats';
import messageRoutes from './instance.messages';
import sendRoutes from './instance.send';
import agentsRoutes from './instance.agents';
import webhooksRoutes from './instance.webhooks';

export default async function (fastify: FastifyInstance) {
  // Register all sub-routes
  await crudRoutes(fastify);
  await connectionRoutes(fastify);
  await chatRoutes(fastify);
  await messageRoutes(fastify);
  await sendRoutes(fastify);
  await agentsRoutes(fastify);
  await webhooksRoutes(fastify);
}
