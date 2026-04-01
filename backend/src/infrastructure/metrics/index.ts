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
 * Architecture:
 * - types.ts: Type definitions
 * - http.metrics.ts: HTTP request metrics
 * - queue.metrics.ts: Message queue metrics
 * - instance.metrics.ts: Instance heartbeat metrics
 * - whatsapp.metrics.ts: WhatsApp API metrics
 * - database.metrics.ts: Prisma database metrics
 * - redis.metrics.ts: Redis metrics
 * - message-status.metrics.ts: Message status metrics
 * - workflow.metrics.ts: Workflow orchestration metrics
 * - http-setup.ts: HTTP middleware hooks registration
 * - setup.ts: Main setup function
 *
 * All files under 150 lines.
 */

// Re-export types
export * from './types';

// Re-export all metric definitions
export * from './http.metrics';
export * from './queue.metrics';
export * from './instance.metrics';
export * from './whatsapp.metrics';
export * from './database.metrics';
export * from './redis.metrics';
export * from './message-status.metrics';
export * from './workflow.metrics';

// Re-export setup functions
export { setupHttpMetrics } from './http-setup';
export { setupMetrics, getMetricsRegistry, resetMetrics } from './setup';
