/**
 * Workflow Orchestration Admin API
 *
 * Endpoints for managing workflow definitions and instances.
 * Registers routes under /admin/workflows
 */

import type { FastifyInstance } from 'fastify';
import * as handlers from './handlers';

/**
 * Register all workflow orchestration routes
 */
export async function registerWorkflowRoutes(fastify: FastifyInstance): Promise<void> {
  // Workflow definitions
  fastify.post('/', handlers.createWorkflowHandler);
  fastify.get('/', handlers.listWorkflowsHandler);
  fastify.get('/:id', handlers.getWorkflowHandler);
  fastify.put('/:id', handlers.updateWorkflowHandler);
  fastify.delete('/:id', handlers.deleteWorkflowHandler);

  // Workflow instances
  fastify.post('/instances', handlers.startWorkflowInstanceHandler);
  fastify.get('/instances', handlers.listWorkflowInstancesHandler);
  fastify.get('/instances/:instanceId', handlers.getWorkflowInstanceHandler);
  fastify.post('/instances/:instanceId/cancel', handlers.cancelWorkflowInstanceHandler);
  fastify.get('/instances/:instanceId/health', handlers.getWorkflowInstanceHealthHandler);

  console.log('[WorkflowAPI] Registered workflow orchestration admin routes under /admin/workflows');
}

export default registerWorkflowRoutes;
