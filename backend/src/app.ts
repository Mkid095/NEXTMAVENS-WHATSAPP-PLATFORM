/**
 * Fastify Application Factory
 *
 * Creates and configures the Fastify app.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { config } from './shared/config';
import logger from './shared/logger';
import { getPrisma } from './shared/database';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rawBody from 'fastify-raw-body';

// Infrastructure initialization functions
import { initializeRateLimiter } from './lib/rate-limiting-with-redis';
import { initializeQuotaLimiter } from './lib/implement-quota-enforcement-middleware';
import { setupMetrics } from './lib/create-comprehensive-metrics-dashboard-(grafana)';
import { initializeIdempotency, registerOnSendHook } from './lib/implement-idempotency-key-system';
import { initializeRetryDlqSystem } from './lib/message-retry-and-dlq-system';
import { initializeFeatureFlags } from './lib/feature-management';
import { initializeEvolutionClient } from './lib/evolution-api-client/instance';

// Middleware (from shared/middleware)
import { authMiddleware } from './shared/middleware/auth';
import { orgGuard } from './shared/middleware/orgGuard';
import { rateLimitCheck } from './shared/middleware/rateLimit';
import { quotaCheck } from './shared/middleware/quota';
import { throttleCheck } from './shared/middleware/throttle';
import { AppError } from './shared/errors';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    disableRequestLogging: false,
  });

  logger.info('[SERVER] Building Fastify app...', { env: config.NODE_ENV });

  // ============================================================================
  // CORE SYSTEM INITIALIZATION
  // ============================================================================

  logger.info('[SERVER] Initializing rate limiter...');
  await initializeRateLimiter();
  logger.info('[SERVER] Rate limiter ready');

  logger.info('[SERVER] Initializing quota limiter...');
  initializeQuotaLimiter({ prisma: getPrisma() });
  logger.info('[SERVER] Quota limiter ready');

  logger.info('[SERVER] Initializing idempotency...');
  await initializeIdempotency();
  logger.info('[SERVER] Idempotency ready');

  logger.info('[SERVER] Registering onSend hook...');
  registerOnSendHook(app);
  logger.info('[SERVER] onSend hook registered');

  // Metrics
  logger.info('[METRICS] Setting up Prometheus metrics...');
  await setupMetrics(app);
  logger.info('[METRICS] /metrics endpoint ready');

  // Background systems
  try {
    await initializeRetryDlqSystem();
    logger.info('[RetryDLQ] System initialized');
  } catch (error) {
    logger.error('[RetryDLQ] Init failed:', error);
  }

  try {
    await initializeFeatureFlags();
    logger.info('[FeatureFlags] Initialized');
  } catch (error) {
    logger.error('[FeatureFlags] Init failed:', error);
  }

  try {
    await initializeEvolutionClient();
    logger.info('[EvolutionAPI] Client ready');
  } catch (error) {
    logger.error('[EvolutionAPI] Init failed:', error);
  }

  // ============================================================================
  // FASTIFY PLUGINS
  // ============================================================================

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  await app.register(rawBody as any, {
    global: true,
    bodyLimit: 1024 * 1024,
    ParseOptions: { limit: '1MB' },
  } as any);

  // ============================================================================
  // GLOBAL MIDDLEWARE (order matters)
  // ============================================================================

  // Auth must be first to set request.user
  app.addHook('preHandler', authMiddleware as any);
  app.addHook('preHandler', orgGuard as any);
  app.addHook('preHandler', rateLimitCheck as any);
  app.addHook('preHandler', quotaCheck as any);
  app.addHook('preHandler', throttleCheck as any);

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      logger.warn(`[Error] ${error.code}: ${error.message}`, {
        url: request.url,
        method: request.method,
      });
      reply.code(error.statusCode).send(error.toJSON());
      return;
    }
    logger.error('[Error] Unhandled exception:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });
    reply.code(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: config.NODE_ENV === 'production' ? 'An internal error occurred' : error.message,
    });
  });

  // setInvalidBodyHandler removed (Fastify v4 uses default error handling)

  // ============================================================================
  // ROUTE REGISTRATION
  // ============================================================================

  await registerRoutes(app);

  logger.info('[SERVER] Fastify app build complete');
  return app;
}

async function registerRoutes(app: FastifyInstance): Promise<void> {
  const routeModules = [
    // Public
    { mod: './app/api/create-comprehensive-health-check-endpoint/route', prefix: '' },
    { mod: './app/api/auth/route', prefix: '/api/v1/auth' },
    { mod: './app/api/integrate-evolution-api-message-status-webhooks/route', prefix: '/api/v1/webhooks' },

    // Core features
    { mod: './app/api/whatsapp-instances/index', prefix: '/api/v1/whatsapp/instances' },
    { mod: './app/api/whatsapp-groups/route', prefix: '/api/v1/whatsapp/groups' },
    { mod: './app/api/whatsapp-templates/route', prefix: '/api/v1/whatsapp/templates' },
    { mod: './app/api/messages/route', prefix: '/api/v1' },
    { mod: './app/api/whatsapp-analytics/route', prefix: '/api/v1/whatsapp/analytics' },

    // Billing
    { mod: './app/api/build-billing-admin-dashboard/route', prefix: '/api/v1/billing' },
    { mod: './app/api/implement-usage-based-billing-&-overage/route', prefix: '/api/v1/billing' },
    { mod: './app/api/build-coupon-&-discount-system/route', prefix: '/api/v1/billing' },
    { mod: './app/api/tax-integration/route', prefix: '/api/v1/billing' },
    { mod: './app/api/implement-card-updates-&-payment-method-management/route', prefix: '/api/v1/billing' },
    { mod: './app/api/build-invoice-generation-&-download/route', prefix: '/api/v1/admin/invoices' },

    // Admin
    { mod: './app/api/admin/route', prefix: '/api/v1/admin' },
    { mod: './app/api/admin/features/route', prefix: '/api/v1/admin' },
    { mod: './app/api/enforce-2fa-for-privileged-roles/route', prefix: '/api/v1/admin/2fa' },
    { mod: './app/api/rate-limiting-with-redis/route', prefix: '/api/v1/admin/rate-limiting' },
    { mod: './app/api/create-comprehensive-metrics-dashboard-(grafana)/route', prefix: '/api/v1/admin' },
    { mod: './app/api/message-status-tracking/route', prefix: '/api/v1' },
    { mod: './app/api/implement-instance-heartbeat-monitoring/instance.route', prefix: '/api/v1/whatsapp/instances' },
    { mod: './app/api/implement-instance-heartbeat-monitoring/admin.route', prefix: '/api/v1/admin/instances' },
    { mod: './app/api/implement-message-deduplication-system/route', prefix: '/api/v1' },
    { mod: './app/api/chat-pagination/route', prefix: '/api/v1' },
    { mod: './app/api/message-retry-and-dlq/route', prefix: '/api/v1' },
    { mod: './app/api/add-advanced-phone-number-validation/route', prefix: '/api/v1' },
    { mod: './app/api/workflow-orchestration/route', prefix: '/api/v1' },
    { mod: './app/api/whatsapp-agents/route', prefix: '/api/v1/whatsapp/agents' },
    { mod: './app/api/whatsapp-assignments/route', prefix: '/api/v1/whatsapp/assignments' },
    { mod: './app/api/whatsapp-reseller/route', prefix: '/api/v1/whatsapp/reseller' },
    { mod: './app/api/whatsapp-webhook-deliveries/route', prefix: '/api/v1/whatsapp/webhook-deliveries' },
  ];

  for (const { mod, prefix } of routeModules) {
    try {
      const routeMod = await import(mod);
      const handler = routeMod.default || routeMod;
      await app.register(handler, { prefix });
      logger.info('[Routes] Registered', { mod, prefix });
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        logger.warn('[Routes] Skipping (not found):', { mod });
      } else {
        logger.error('[Routes] Failed to load:', { mod, error: error.message });
      }
    }
  }

  logger.info('[Routes] Registration complete');
}
