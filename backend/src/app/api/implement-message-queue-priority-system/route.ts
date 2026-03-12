/**
 * BullMQ Queue Admin API
 *
 * Endpoints for monitoring and managing the message queue.
 * Protected by auth + orgGuard middleware (SUPER_ADMIN only effectively).
 */

import { z, ZodError } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  getQueueMetrics,
  pauseQueue,
  resumeQueue,
  cleanOldJobs,
  validateRedisConnection,
  getWorkerStatus,
  messageQueue,
  QUEUE_NAME
} from '../../../lib/message-queue-priority-system';

// ============================================================================
// Validation Schemas
// ============================================================================

const cleanQueueSchema = z.object({
  ageHours: z.number().int().positive().optional(),
  batchSize: z.number().int().positive().optional()
});

// ============================================================================
// Route Handlers
// ============================================================================

export async function getMetricsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const metrics = await getQueueMetrics();
    const workerStatus = getWorkerStatus();
    const redisHealthy = await validateRedisConnection();

    return {
      success: true,
      data: {
        queue: {
          name: metrics.name,
          waiting: metrics.waiting,
          active: metrics.active,
          completed: metrics.completed,
          failed: metrics.failed,
          delayed: metrics.delayed,
          priorityRanges: metrics.priorityRanges
        },
        worker: workerStatus,
        redis: {
          connected: redisHealthy
        }
      }
    };
  } catch (error: any) {
    console.error('[QueueAdmin] Error fetching metrics:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch queue metrics',
      details: error.message
    });
  }
}

export async function pauseQueueHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await pauseQueue();
    return {
      success: true,
      data: {
        paused: true,
        queue: QUEUE_NAME
      }
    };
  } catch (error: any) {
    console.error('[QueueAdmin] Error pausing queue:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to pause queue',
      details: error.message
    });
  }
}

export async function resumeQueueHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await resumeQueue();
    return {
      success: true,
      data: {
        paused: false,
        queue: QUEUE_NAME
      }
    };
  } catch (error: any) {
    console.error('[QueueAdmin] Error resuming queue:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to resume queue',
      details: error.message
    });
  }
}

export async function cleanQueueHandler(request: FastifyRequest<{ Body: z.infer<typeof cleanQueueSchema> }>, reply: FastifyReply) {
  try {
    const { ageHours = 24, batchSize = 1000 } = request.body;

    // Note: cleanOldJobs returns a count but is currently a placeholder
    await cleanOldJobs(ageHours, batchSize);

    return {
      success: true,
      data: {
        cleaned: true,
        ageHours,
        batchSize,
        queue: QUEUE_NAME
      }
    };
  } catch (error: any) {
    console.error('[QueueAdmin] Error cleaning queue:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to clean queue',
      details: error.message
    });
  }
}

export async function healthHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const workerStatus = getWorkerStatus();
    const redisHealthy = await validateRedisConnection();

    // Check if Redis is connected and worker is running
    const isHealthy = redisHealthy && workerStatus.isRunning;

    const statusCode = isHealthy ? 200 : 503;
    reply.code(statusCode);

    return {
      success: isHealthy,
      data: {
        queue: QUEUE_NAME,
        redis: {
          connected: redisHealthy
        },
        worker: workerStatus
      }
    };
  } catch (error: any) {
    console.error('[QueueAdmin] Error checking health:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to check health',
      details: error.message
    });
  }
}

// ============================================================================
// Fastify Route Registration
// ============================================================================

export async function registerQueueAdminRoutes(fastify: any) {
  fastify.get('/admin/queues/metrics', { schema: { hide: true } }, getMetricsHandler);
  fastify.post('/admin/queues/pause', { schema: { hide: true } }, pauseQueueHandler);
  fastify.post('/admin/queues/resume', { schema: { hide: true } }, resumeQueueHandler);
  fastify.post('/admin/queues/clean', { schema: { body: cleanQueueSchema, hide: true } }, cleanQueueHandler);
  fastify.get('/admin/queues/health', { schema: { hide: true } }, healthHandler);

  console.log('[QueueAdmin] Registered admin queue routes under /admin/queues');
}
