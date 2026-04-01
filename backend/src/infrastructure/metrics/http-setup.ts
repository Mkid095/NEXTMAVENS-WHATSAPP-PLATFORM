/**
 * HTTP Metrics Setup
 * Registers Fastify hooks to collect request/response metrics
 */

import type { FastifyInstance } from 'fastify';
import {
  httpActiveConnections,
  httpRequestsTotal,
  httpRequestDuration,
  httpErrorsTotal
} from './http.metrics';

/**
 * Setup HTTP request/response metrics middleware.
 */
export function setupHttpMetrics(fastify: FastifyInstance): void {
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
