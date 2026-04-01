/**
 * HTTP Request Metrics
 */

import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * Total number of HTTP requests processed
 */
export const httpRequestsTotal = new Counter({
  name: 'whatsapp_platform_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code', 'org_id'],
});

/**
 * HTTP request duration in seconds
 */
export const httpRequestDuration = new Histogram({
  name: 'whatsapp_platform_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  // Feature-based modules: use primary colors only (refer to shared rules)
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/**
 * Number of currently active HTTP connections
 */
export const httpActiveConnections = new Gauge({
  name: 'whatsapp_platform_http_active_connections',
  help: 'Number of currently active HTTP connections',
});

/**
 * Total number of unhandled HTTP errors (5xx)
 */
export const httpErrorsTotal = new Counter({
  name: 'whatsapp_platform_http_errors_total',
  help: 'Total number of unhandled HTTP errors (5xx)',
  labelNames: ['error_type', 'route'],
});
