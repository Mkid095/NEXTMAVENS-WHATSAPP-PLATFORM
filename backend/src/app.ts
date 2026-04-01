/**
 * Fastify Application Factory
 *
 * Creates and configures the Fastify app.
 */

import Fastify from 'fastify';
import { config } from './shared/config.js';
import logger from './shared/logger.js';
import { getPrisma } from './shared/database.js';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rawBody from 'fastify-raw-body';

// Infrastructure initialization functions
import { initializeRateLimiter } from './lib/rate-limiting-with-redis/index.js';
import { initializeQuotaLimiter } from './lib/implement-quota-enforcement-middleware/index.js';
import { setupMetrics } from './lib/create-comprehensive-metrics-dashboard-(grafana)/index.js';
import { initializeIdempotency, registerOnSendHook } from './lib/implement-idempotency-key-system/index.js';
import { initializeRetryDlqSystem } from './lib/message-retry-and-dlq-system/index.js';
import { initializeFeatureFlags } from './lib/feature-management/index.js';
import { initializeEvolutionClient } from './lib/evolution-api-client/instance.js';

// Middleware (from shared/middleware)
import { authMiddleware } from './shared/middleware/auth.js';
import { orgGuard } from './shared/middleware/orgGuard.js';
import { rateLimitCheck } from './shared/middleware/rateLimit.js';
import { quotaCheck } from './shared/middleware/quota.js';
import { throttleCheck } from './shared/middleware/throttle.js';

export async function buildServer(): Promise<Fastify.FastifyInstance> {
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

  await app.register(rawBody, {
    global: true,
    bodyLimit: 1024 * 1024,
    ParseOptions: { limit: '1MB' },
  });

  // ============================================================================
  // GLOBAL MIDDLEWARE (order matters)
  // ============================================================================

  // Auth must be first to set request.user
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', orgGuard);
  app.addHook('preHandler', rateLimitCheck);
  app.addHook('preHandler', quotaCheck);
  app.addHook('preHandler', throttleCheck);

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
    const { AppError } = require('./shared/errors.js');
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

  app.setInvalidBodyHandler((request, reply, payload) => {
    logger.warn('[InvalidBody] Bad JSON', { payload });
    reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid JSON payload' });
  });

  // ============================================================================
  // ROUTE REGISTRATION
  // ============================================================================

  await registerRoutes(app);

  logger.info('[SERVER] Fastify app build complete');
  return app;
}

async function registerRoutes(app: Fastify.FastifyInstance): Promise<void> {
  const routeModules = [
    // Public
    { mod: './app/api/create-comprehensive-health-check-endpoint/route.js', prefix: '' },
    { mod: './app/api/auth/route.js', prefix: '/api/v1/auth' },
    { mod: './app/api/integrate-evolution-api-message-status-webhooks/route.js', prefix: '/api/v1/webhooks' },

    // Core features
    { mod: './app/api/whatsapp-instances/index.js', prefix: '/api/v1/whatsapp' },
    { mod: './app/api/whatsapp-groups/route.js', prefix: '/api/v1/whatsapp' },
    { mod: './app/api/whatsapp-templates/route.js', prefix: '/api/v1/whatsapp' },
    { mod: './app/api/messages/route.js', prefix: '/api/v1' },
    { mod: './app/api/whatsapp-analytics/route.js', prefix: '/api/v1/analytics' },

    // Billing
    { mod: './app/api/build-billing-admin-dashboard/route.js', prefix: '/api/v1/billing' },
    { mod: './app/api/implement-usage-based-billing-&-overage/route.js', prefix: '/api/v1/billing' },
    { mod: './app/api/build-coupon-&-discount-system/route.js', prefix: '/api/v1/billing' },
    { mod: './app/api/tax-integration/route.js', prefix: '/api/v1/billing' },
    { mod: './app/api/implement-card-updates-&-payment-method-management/route.js', prefix: '/api/v1/billing' },
    { mod: './app/api/build-invoice-generation-&-download/route.js', prefix: '/api/v1/admin' },

    // Admin
    { mod: './app/api/admin/route.js', prefix: '/api/v1/admin' },
    { mod: './app/api/admin/features/route.js', prefix: '/api/v1/admin' },
    { mod: './app/api/enforce-2fa-for-privileged-roles/route.js', prefix: '/api/v1/admin' },
    { mod: './app/api/rate-limiting-with-redis/route.js', prefix: '/api/v1/admin' },
    { mod: './app/api/create-comprehensive-metrics-dashboard-(grafana)/route.js', prefix: '/api/v1/admin' },
    { mod: './app/api/message-status-tracking/route.js', prefix: '/api/v1' },
    { mod: './app/api/implement-instance-heartbeat-monitoring/instance.route.js', prefix: '/api/v1/whatsapp' },
    { mod: './app/api/implement-instance-heartbeat-monitoring/admin.route.js', prefix: '/api/v1/admin' },
    { mod: './app/api/implement-message-deduplication-system/route.js', prefix: '/api/v1' },
    { mod: './app/api/chat-pagination/route.js', prefix: '/api/v1' },
    { mod: './app/api/message-retry-and-dlq/route.js', prefix: '/api/v1' },
    { mod: './app/api/add-advanced-phone-number-validation/route.js', prefix: '/api/v1' },
    { mod: './app/api/workflow-orchestration/route.js', prefix: '/api/v1' },
    { mod: './app/api/whatsapp-agents/route.js', prefix: '/api/v1/whatsapp' },
    { mod: './app/api/whatsapp-assignments/route.js', prefix: '/api/v1/whatsapp' },
    { mod: './app/api/whatsapp-reseller/route.js', prefix: '/api/v1/whatsapp' },
    { mod: './app/api/whatsapp-webhook-deliveries/route.js', prefix: '/api/v1/whatsapp' },
  ];

  for (const { mod, prefix } of routeModules) {
    try {
      const routeMod = await import(mod);
      const handler = routeMod.default || routeMod;
      await app.register(handler, { prefix });
      logger.info('[Routes] Registered', { mod, prefix });
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        logger.warn('[Routes] Skipping (not found):', mod);
      } else {
        logger.error('[Routes] Failed to load:', { mod, error: error.message });
      }
    }
  }

  logger.info('[Routes] Registration complete');
}
