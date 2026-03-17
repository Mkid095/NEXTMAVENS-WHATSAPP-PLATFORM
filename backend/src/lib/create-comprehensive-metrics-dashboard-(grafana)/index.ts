/**
 * Comprehensive Metrics Dashboard (Grafana)
 * Instrumentation library using prom-client for Prometheus metrics.
 *
 * Features:
 * - HTTP request/response metrics
 * - Message queue metrics
 * - Instance heartbeat metrics
 * - WhatsApp API metrics
 * - Database (Prisma) metrics
 * - Redis metrics
 * - Node.js process metrics (default)
 *
 * Usage:
 *   import { setupMetrics, getMetricsRegistry } from './lib/create-comprehensive-metrics-dashboard-(grafana)';
 *   await setupMetrics(fastifyInstance);
 *
 * Metrics exposed at GET /metrics (Prometheus text format)
 */

import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ============================================================================
// Types
// ============================================================================

export interface MetricLabels {
  [key: string]: string;
}

// ============================================================================
// Metric Definitions
// ============================================================================

/**
 * HTTP Metrics
 */
export const httpRequestsTotal = new Counter({
  name: 'whatsapp_platform_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code', 'org_id'],
});

export const httpRequestDuration = new Histogram({
  name: 'whatsapp_platform_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  // Feature-based modules: use primary colors only (refer to shared rules)
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpActiveConnections = new Gauge({
  name: 'whatsapp_platform_http_active_connections',
  help: 'Number of currently active HTTP connections',
});

export const httpErrorsTotal = new Counter({
  name: 'whatsapp_platform_http_errors_total',
  help: 'Total number of unhandled HTTP errors (5xx)',
  labelNames: ['error_type', 'route'],
});

/**
 * Message Queue Metrics
 */
export const queueJobsTotal = new Counter({
  name: 'whatsapp_platform_queue_jobs_total',
  help: 'Total number of jobs added to the queue',
  labelNames: ['message_type', 'priority'],
});

export const queueJobsActive = new Gauge({
  name: 'whatsapp_platform_queue_jobs_active',
  help: 'Number of currently processing jobs',
});

export const queueJobsCompletedTotal = new Counter({
  name: 'whatsapp_platform_queue_jobs_completed_total',
  help: 'Total number of jobs completed successfully',
  labelNames: ['message_type'],
});

export const queueJobsFailedTotal = new Counter({
  name: 'whatsapp_platform_queue_jobs_failed_total',
  help: 'Total number of jobs failed and moved to DLQ',
  labelNames: ['failure_type'],
});

export const queueJobsRetryTotal = new Counter({
  name: 'whatsapp_platform_queue_jobs_retry_total',
  help: 'Total number of retry attempts made',
  labelNames: ['message_type'],
});

export const queueJobsRetryDelaySeconds = new Histogram({
  name: 'whatsapp_platform_queue_retry_delay_seconds',
  help: 'Retry delay distribution in seconds',
  labelNames: ['message_type', 'attempt'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
});

export const queueDlqSize = new Gauge({
  name: 'whatsapp_platform_queue_dlq_size',
  help: 'Current size of the dead letter queue',
  labelNames: ['message_type'],
});

export const queueDlqReplayTotal = new Counter({
  name: 'whatsapp_platform_queue_dlq_replay_total',
  help: 'Total number of messages replayed from DLQ',
  labelNames: ['message_type'],
});

export const messageFailureReasonTotal = new Counter({
  name: 'whatsapp_platform_message_failure_reason_total',
  help: 'Total number of failures by error category',
  labelNames: ['message_type', 'error_category', 'reason'],
});

export const queueWorkersActive = new Gauge({
  name: 'whatsapp_platform_queue_workers_active',
  help: 'Number of active worker processes',
});

export const queueProcessingDuration = new Histogram({
  name: 'whatsapp_platform_queue_processing_duration_seconds',
  help: 'Time from job enqueue to completion',
  labelNames: ['message_type'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
});

/**
 * Instance Heartbeat Metrics
 */
export const instanceHeartbeatTotal = new Counter({
  name: 'whatsapp_platform_instance_heartbeat_total',
  help: 'Total heartbeats received from WhatsApp instances',
  labelNames: ['status'], // 'online' or 'offline'
});

export const instanceCurrentlyOnline = new Gauge({
  name: 'whatsapp_platform_instance_currently_online',
  help: 'Number of instances currently online',
});

export const instanceHeartbeatAge = new Gauge({
  name: 'whatsapp_platform_instance_heartbeat_age_seconds',
  help: 'Age of last heartbeat per instance (seconds since last update)',
  labelNames: ['instance_id', 'organisation_id'],
});

export const instanceBackgroundSyncDuration = new Histogram({
  name: 'whatsapp_platform_instance_background_sync_duration_seconds',
  help: 'Duration of background sync job (syncing Redis → PostgreSQL)',
  buckets: [0.1, 0.5, 1, 2.5, 5, 10],
});

/**
 * WhatsApp API Metrics
 */
export const whatsappApiRequestsTotal = new Counter({
  name: 'whatsapp_platform_whatsapp_api_requests_total',
  help: 'Total requests made to WhatsApp Cloud API',
  labelNames: ['endpoint', 'method', 'status_code'],
});

export const whatsappApiRequestDuration = new Histogram({
  name: 'whatsapp_platform_whatsapp_api_request_duration_seconds',
  help: 'WhatsApp API request latency',
  labelNames: ['endpoint', 'method'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

export const whatsappApiErrorsTotal = new Counter({
  name: 'whatsapp_platform_whatsapp_api_errors_total',
  help: 'Total errors from WhatsApp API',
  labelNames: ['error_code', 'error_type'],
});

export const whatsappMessagesSentTotal = new Counter({
  name: 'whatsapp_platform_whatsapp_messages_sent_total',
  help: 'Total messages sent via WhatsApp',
  labelNames: ['message_type'], // text, image, document, audio, video, etc.
});

export const whatsappMessageStatusUpdatesTotal = new Counter({
  name: 'whatsapp_platform_whatsapp_message_status_updates_total',
  help: 'Total webhook status callbacks received from WhatsApp',
  labelNames: ['status'], // sent, delivered, read, failed
});

/**
 * Database (Prisma) Metrics
 */
export const prismaQueriesTotal = new Counter({
  name: 'whatsapp_platform_prisma_queries_total',
  help: 'Total database queries executed via Prisma',
  labelNames: ['operation', 'model'],
});

export const prismaQueryDuration = new Histogram({
  name: 'whatsapp_platform_prisma_query_duration_seconds',
  help: 'Database query execution time',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

export const prismaErrorsTotal = new Counter({
  name: 'whatsapp_platform_prisma_errors_total',
  help: 'Total database errors',
  labelNames: ['error_code', 'code_name'],
});

export const prismaConnectionPoolUsed = new Gauge({
  name: 'whatsapp_platform_prisma_connection_pool_used',
  help: 'Number of active connections in Prisma connection pool',
});

export const prismaConnectionPoolAvailable = new Gauge({
  name: 'whatsapp_platform_prisma_connection_pool_available',
  help: 'Number of available connections in Prisma connection pool',
});

/**
 * Redis Metrics
 */
export const redisCommandsTotal = new Counter({
  name: 'whatsapp_platform_redis_commands_total',
  help: 'Total Redis commands executed',
  labelNames: ['command'],
});

export const redisCommandDuration = new Histogram({
  name: 'whatsapp_platform_redis_command_duration_seconds',
  help: 'Redis command execution latency',
  labelNames: ['command'],
  buckets: [0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1],
});

export const redisConnectionsActive = new Gauge({
  name: 'whatsapp_platform_redis_connections_active',
  help: 'Number of active Redis connections',
});

export const redisMemoryUsage = new Gauge({
  name: 'whatsapp_platform_redis_memory_usage_bytes',
  help: 'Redis memory usage in bytes',
});

// ============================================================================
// Message Status Metrics (Phase 3 Step 2)
// ============================================================================

export const messageStatusDistribution = new Gauge({
  name: 'whatsapp_platform_message_status_distribution',
  help: 'Current number of messages by status',
  labelNames: ['status', 'org_id'],
});

export const messageStatusTransitionsTotal = new Counter({
  name: 'whatsapp_platform_message_status_transitions_total',
  help: 'Total number of status transitions',
  labelNames: ['from', 'to', 'reason'],
});

export const messageStatusUpdateDuration = new Histogram({
  name: 'whatsapp_platform_message_status_update_duration_seconds',
  help: 'Time taken to update message status',
  labelNames: ['reason'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const messageStatusHistoryEntriesTotal = new Counter({
  name: 'whatsapp_platform_message_status_history_entries_total',
  help: 'Total number of status history entries created',
  labelNames: ['reason'],
});

// ============================================================================
// Workflow Orchestration Metrics (Phase 3 Step 3)
// ============================================================================

export const workflowInstancesTotal = new Counter({
  name: 'whatsapp_platform_workflow_instances_total',
  help: 'Total number of workflow instances created',
  labelNames: ['workflow_id', 'org_id', 'status'],
});

export const workflowStepsCompletedTotal = new Counter({
  name: 'whatsapp_platform_workflow_steps_completed_total',
  help: 'Total number of workflow steps completed successfully',
  labelNames: ['workflow_id', 'step_name'],
});

export const workflowStepsFailedTotal = new Counter({
  name: 'whatsapp_platform_workflow_steps_failed_total',
  help: 'Total number of workflow steps that failed',
  labelNames: ['workflow_id', 'step_name', 'error_category'],
});

export const workflowCompensationsTriggeredTotal = new Counter({
  name: 'whatsapp_platform_workflow_compensations_triggered_total',
  help: 'Total number of compensation flows triggered',
  labelNames: ['workflow_id', 'trigger_reason'],
});

export const workflowDurationSeconds = new Histogram({
  name: 'whatsapp_platform_workflow_duration_seconds',
  help: 'Workflow execution duration from start to completion',
  labelNames: ['workflow_id', 'status'],
  buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
});

export const workflowStepDurationSeconds = new Histogram({
  name: 'whatsapp_platform_workflow_step_duration_seconds',
  help: 'Individual step execution duration',
  labelNames: ['workflow_id', 'step_name'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
});

// ============================================================================
// Setup Function
// ============================================================================

/**
 * Setup all metrics collectors and register Fastify endpoint.
 * Call this once during server startup.
 */
export async function setupMetrics(fastify: FastifyInstance): Promise<void> {
  // Collect default Node.js metrics every 10 seconds
  collectDefaultMetrics({
    prefix: 'whatsapp_platform_nodejs_',
  });

  // Register HTTP middleware hooks
  setupHttpMetrics(fastify);

  // Register metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.type(register.contentType);
    try {
      return await register.metrics();
    } catch (err) {
      reply.code(500);
      return `# Error generating metrics: ${err}\n`;
    }
  });

  // Start collecting application-specific metrics
  startCollectors();
}

/**
 * Setup HTTP request/response metrics middleware.
 */
function setupHttpMetrics(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (req, reply, done) => {
    httpActiveConnections.inc();
    // Store start time for duration calculation
    (req as any)._metricsStartTime = Date.now();
    done();
  });

  fastify.addHook('onResponse', (req, reply, done) => {
    httpActiveConnections.dec();

    const startTime = (req as any)._metricsStartTime;
    const duration = startTime ? (Date.now() - startTime) / 1000 : 0;

    const route = req.raw?.url?.split('?')[0] || 'unknown';
    const method = req.method;
    const statusCode = reply.statusCode;
    const orgId = (req as any).orgId || 'unknown';

    // Record request count
    httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
      org_id: orgId,
    });

    // Record duration
    if (duration > 0) {
      httpRequestDuration.observe(
        { method, route, status_code: statusCode.toString() },
        duration
      );
    }

    // Record errors (5xx)
    if (statusCode >= 500) {
      const errorType = statusCode === 500 ? 'internal' : `http_${statusCode}`;
      httpErrorsTotal.inc({ error_type: errorType, route });
    }

    done();
  });

  // Error handler to record unhandled errors
  fastify.setErrorHandler(function (this: FastifyInstance, error, request, reply) {
    const route = request.raw?.url?.split('?')[0] || 'unknown';
    httpErrorsTotal.inc({ error_type: error.name || 'unknown', route });
    // Continue to default error handler (do not send response)
  });
}

/**
 * Start background metric collectors (Redis, Prisma, queue polling).
 */
function startCollectors(): void {
  // TODO: Implement periodic collectors:
  // - Redis memory usage
  // - Prisma connection pool stats
  // - Instance heartbeat age distribution

  // For now, collectors will be called from their respective modules
}

/**
 * Get the global metrics registry (for testing/inspection).
 */
export function getMetricsRegistry() {
  return register;
}

/**
 * Reset all metrics (useful for testing).
 */
export function resetMetrics(): void {
  register.clear();
}
