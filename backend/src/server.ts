/**
 * NEXTMAVENS WhatsApp Platform - Backend Server
 *
 * Fastify server hosting webhook endpoints and future API routes.
 *
 * Start: npm run dev
 */

// Load environment variables from .env file
import 'dotenv/config';

import Fastify from 'fastify';
import * as http from 'http';
import { join } from 'path';
import { fileURLToPath } from 'url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rawBody from 'fastify-raw-body';

// Import Prisma singleton
import { prisma } from './lib/prisma.ts';

// Import middleware for global pipeline
import { authMiddleware } from './middleware/auth.ts';
import { orgGuard } from './middleware/orgGuard.ts';
import { getRateLimiter, generateIdentifier, initializeRateLimiter } from './lib/rate-limiting-with-redis/index.ts';
import { initializeQuotaLimiter, QuotaMetric } from './lib/implement-quota-enforcement-middleware/index.ts';

// Wrapper middleware functions
import { rateLimitCheck } from './middleware/rateLimit.ts';
import { quotaCheck } from './middleware/quota.ts';
import { throttleCheck } from './middleware/throttle.ts';

// 2FA
import { require2FA } from './lib/enforce-2fa-for-privileged-roles/index.ts';

// Idempotency
import {
  initializeIdempotency,
  checkIdempotencyCache,
  registerOnSendHook
} from './lib/implement-idempotency-key-system/index.ts';

// Metrics (Phase 2 Step 8)
import { setupMetrics } from './lib/create-comprehensive-metrics-dashboard-(grafana)/index.ts';

// Evolution API Client
import { initializeEvolutionClient } from './lib/evolution-api-client/instance.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  console.log('[SERVER] Starting buildServer...');

  // ============================================================================
  // INITIALIZE CORE SYSTEMS
  // ============================================================================
  console.log('[SERVER] Initializing rate limiter...');
  await initializeRateLimiter();
  console.log('[SERVER] Rate limiter initialized');

  console.log('[SERVER] Initializing quota limiter with shared Prisma client...');
  initializeQuotaLimiter({ prisma });
  console.log('[SERVER] Quota limiter initialized');

  console.log('[SERVER] Initializing idempotency...');
  await initializeIdempotency();
  console.log('[SERVER] Idempotency initialized');

  console.log('[SERVER] Registering onSend hook...');
  registerOnSendHook(app); // Register onSend hook for idempotency response caching
  console.log('[SERVER] onSend hook registered');

  // ============================================================================
  // METRICS COLLECTION (Phase 2 Step 8)
  // ============================================================================
  console.log('[METRICS] Setting up Prometheus metrics...');
  await setupMetrics(app);
  console.log('[METRICS] Metrics endpoint available at /metrics');

  // ============================================================================
  // RETRY & DLQ SYSTEM INITIALIZATION (Phase 3 Step 1)
  // ============================================================================
  try {
    const { initializeRetryDlqSystem } = await import('./lib/message-retry-and-dlq-system');
    await initializeRetryDlqSystem();
    console.log('[RetryDLQ] System initialized successfully');
  } catch (error) {
    console.error('[RetryDLQ] Initialization failed:', error);
    // Fail open - continue without retry/DLQ if it fails to initialize
  }

  // ============================================================================
  // FEATURE FLAGS INITIALIZATION (Phase 3 Step 8.5)
  // ============================================================================
  try {
    const { initializeFeatureFlags } = await import('./lib/feature-management');
    await initializeFeatureFlags();
    console.log('[FeatureManagement] Feature flags initialized with defaults');
  } catch (error) {
    console.error('[FeatureManagement] Initialization failed:', error);
    // Fail open - continue if feature flags fail to initialize
  }

  // ============================================================================
  // EVOLUTION API CLIENT INITIALIZATION
  // ============================================================================
  try {
    await initializeEvolutionClient();
    console.log('[EvolutionAPI] Client initialized and connection verified');
  } catch (error) {
    console.error('[EvolutionAPI] Initialization failed:', error);
    // Fail open - allow server to start even if Evolution is down
    // Messages will fail at send time but health check will show degraded
  }

  // ============================================================================
  // GLOBAL PREHANDLER MIDDLEWARE PIPELINE
  // ============================================================================
  app.addHook('preHandler', async (request, reply) => {
    console.log(`[PREHANDLER] START ${request.method} ${request.url}`);

    // Early exit: if another preHandler has already responded, skip
    if (reply.raw?.headersSent) {
      return;
    }

    // Health check - immediate response (public)
    if (request.url === '/health') {
      return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    }

    // Public endpoints that don't require authentication
    const publicPaths = [
      '/ping',
      '/metrics', // Prometheus metrics endpoint (public)
      '/api/webhooks/evolution', // Evolution API webhook receiver (signature verified in route)
      '/api/instances/', // Instance heartbeat endpoint (uses instance token for auth)
      '/api/v1/auth/login', // User login
      '/api/v1/auth/refresh', // Token refresh
      '/api/v1/auth/logout', // User logout
    ];
    if (publicPaths.some(p => request.url?.startsWith(p))) {
      console.log(`[PREHANDLER] ${request.method} ${request.url} - public, exiting`);
      return; // Allow public routes to proceed without auth
    }

    // ┌─────────────────────────────────────────────────────────────┐
    // │ Step 1: Authentication (JWT validation)                    │
    // └─────────────────────────────────────────────────────────────┘
    try {
      await authMiddleware(request, reply, (err) => {
        if (err) {
          reply.code(401).send({ error: 'Unauthorized', message: err.message });
        }
      });
      // If auth set a response code, stop processing
      if (reply.raw?.headersSent) {
        return;
      }
    } catch (error) {
      console.error('[Auth Middleware] Error:', error);
      reply.code(500).send({ error: 'Internal Server Error' });
      return;
    }

    // ┌─────────────────────────────────────────────────────────────┐
    // │ Step 2: Organization Guard (RLS context + membership)     │
    // └─────────────────────────────────────────────────────────────┘
    try {
      await orgGuard(request, reply, (err) => {
        if (err) {
          reply.code(403).send({ error: 'Access denied', message: err.message });
        }
      });
      if (reply.raw?.headersSent) {
        return;
      }
    } catch (error) {
      console.error('[OrgGuard Middleware] Error:', error);
      reply.code(500).send({ error: 'Internal Server Error' });
      return;
    }

    // ┌─────────────────────────────────────────────────────────────┐
    // │ Step 3: 2FA Enforcement (privileged roles)                 │
    // └─────────────────────────────────────────────────────────────┘
    try {
      await require2FA().onRequest(request, reply, (err) => {
        if (err) {
          reply.code(403).send({ error: '2FA required', message: err.message });
        }
      });
      if (reply.raw?.headersSent) {
        return;
      }
    } catch (error) {
      console.error('[2FA] Error:', error);
      reply.code(500).send({ error: '2FA check failed' });
      return;
    }

    // ┌─────────────────────────────────────────────────────────────┐
    // │ Step 4: Rate Limiting                                       │
    // └─────────────────────────────────────────────────────────────┘
    try {
      await rateLimitCheck(request, reply, (err) => {
        if (err) {
          reply.code(500).send({
            error: 'Rate limit service error',
            message: err.message,
          });
        }
      });
      if (reply.raw?.headersSent) {
        return;
      }
    } catch (error) {
      console.error('[RateLimit] Error:', error);
      reply.code(500).send({ error: 'Rate limit check failed' });
      return;
    }

    // ┌─────────────────────────────────────────────────────────────┐
    // │ Step 5: Quota Enforcement                                   │
    // └─────────────────────────────────────────────────────────────┘
    try {
      await quotaCheck(request, reply, (err) => {
        if (err) {
          reply.code(500).send({
            error: 'Quota service error',
            message: err.message,
          });
        }
      });
      if (reply.raw?.headersSent) {
        return;
      }
    } catch (error) {
      console.error('[Quota] Error:', error);
      reply.code(500).send({ error: 'Quota check failed' });
      return;
    }

    // ┌─────────────────────────────────────────────────────────────┐
    // │ Step 6: WhatsApp Message Throttling                         │
    // └─────────────────────────────────────────────────────────────┘
    try {
      await throttleCheck(request, reply, (err) => {
        if (err) {
          reply.code(500).send({
            error: 'Throttle service error',
            message: err.message,
          });
        }
      });
      if (reply.raw?.headersSent) {
        return;
      }
    } catch (error) {
      console.error('[Throttle] Error:', error);
      reply.code(500).send({ error: 'Throttle check failed' });
      return;
    }

    // ┌─────────────────────────────────────────────────────────────┐
    // │ Step 7: Idempotency (HTTP cache)                           │
    // └─────────────────────────────────────────────────────────────┘
    try {
      const cached = await checkIdempotencyCache(request, reply);
      if (cached) {
        // Response served from cache, stop further processing
        return;
      }
      // Continue if not cached (will be cached on response send via onSend hook)
    } catch (error) {
      console.error('[Idempotency] Error:', error);
      // Fail open: continue processing if idempotency fails
    }

    // All middleware passed, continue to route handler
    console.log(`[PREHANDLER] ${request.method} ${request.url} - pipeline complete`);
    return;
  });

  console.log('[SERVER] PreHandler hook ENABLED with: auth, orgGuard, rateLimit, quota, throttle, idempotency');

  // Security middleware
  await app.register(helmet);

  // CORS - configure appropriately for your frontend
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Raw body plugin for webhook signature verification
  await app.register(rawBody, { global: false }); // per-route usage

  // DIAGNOSTIC: Add a simple synchronous test route first
  app.get('/ping', (request, reply) => {
    console.log('[TEST ROUTE] /ping handler invoked');
    return { ok: true, timestamp: Date.now() };
  });

  console.log('[SERVER] Test route /ping registered');

  // Register Authentication routes (NEW - for login)
  const authRoutes = await import('./app/api/auth/route.ts');
  // @ts-ignore - Fastify plugin type compatibility with dynamic imports
  await app.register(authRoutes, { prefix: '/api/v1' });
  console.log('[SERVER] Auth routes registered');

  // Register WhatsApp Instances routes
  const whatsappInstancesRoutes = await import('./app/api/whatsapp-instances/route.ts');
  // @ts-ignore
  await app.register(whatsappInstancesRoutes.default || whatsappInstancesRoutes, { prefix: '/api/v1' });
  console.log('[SERVER] WhatsApp instances routes registered');

  // ============================================================================
  // ROUTE REGISTRATIONS - ALL RESTORED
  // ============================================================================

  // Register Comprehensive Health Check Endpoint (Phase 1 Step 8)
  const healthRoutes = await import('./app/api/create-comprehensive-health-check-endpoint/route.ts');
  // @ts-ignore
  await app.register(healthRoutes.default || healthRoutes);
  console.log('[SERVER] Health routes registered');

  // Register Evolution API webhook routes
  const evolutionRoutes = await import('./app/api/integrate-evolution-api-message-status-webhooks/route.ts');
  // @ts-ignore - dynamic import type mismatch
  await app.register(evolutionRoutes.default || evolutionRoutes);
  console.log('[SERVER] Evolution webhook routes registered');

  // Register Retry Logic API routes (Step 4)
  const retryLogicRoutes = await import('./app/api/build-retry-logic-with-progressive-backoff/route.ts');
  // @ts-ignore
  await app.register(retryLogicRoutes.default || retryLogicRoutes);
  console.log('[SERVER] Retry logic routes registered');

  // Register Advanced Phone Number Validation routes (Step 5)
  const phoneValidationRoutes = await import('./app/api/add-advanced-phone-number-validation/route.ts');
  // @ts-ignore
  await app.register(phoneValidationRoutes.default || phoneValidationRoutes);
  console.log('[SERVER] Phone validation routes registered');

  // Register Message Deduplication System API routes (Step 6)
  const dedupRoutes = await import('./app/api/implement-message-deduplication-system/route.ts');
  // @ts-ignore
  await app.register(dedupRoutes.default || dedupRoutes, { prefix: '/api/deduplication' });
  console.log('[SERVER] Deduplication routes registered');

  // Register Message Delivery Receipts System API routes (Step 7)
  const receiptRoutes = await import('./app/api/build-message-delivery-receipts-system/route.ts');
  // @ts-ignore
  await app.register(receiptRoutes.default || receiptRoutes);
  console.log('[SERVER] Receipt routes registered');

  // Register Chat Pagination API routes (Phase 1 Step 13 - NEW)
  const chatPaginationRoutes = await import('./app/api/chat-pagination/route.ts');
  // @ts-ignore
  await app.register(chatPaginationRoutes.default || chatPaginationRoutes);
  console.log('[SERVER] Chat pagination routes registered');

  // Register Messages Send API routes (Phase ? - New)
  const messagesRoutes = await import('./app/api/messages/index.ts');
  // @ts-ignore - Fastify plugin type compatibility with dynamic imports
  await app.register(messagesRoutes.default || messagesRoutes, { prefix: '/api/v1/messages' });
  console.log('[SERVER] Messages send routes registered');

  // Register Rate Limiting System API routes (Phase 1 Step 3)
  const rateLimitRoutes = await import('./app/api/rate-limiting-with-redis/route.ts');
  // @ts-ignore
  await app.register(rateLimitRoutes.default || rateLimitRoutes, { prefix: '/admin/rate-limiting' });
  console.log('[SERVER] Rate limit admin routes registered');

  // Register Quota Enforcement System API routes (Phase 1 Step 6)
  const quotaRoutes = await import('./app/api/implement-quota-enforcement-middleware/route.ts');
  // @ts-ignore
  await app.register(quotaRoutes.default || quotaRoutes, { prefix: '/admin/quotas' });
  console.log('[SERVER] Quota admin routes registered');

  // Register Queue Priority System Admin API routes (Phase 2 Step 3 - Admin API)
  const queueAdminRoutes = await import('./app/api/implement-message-queue-priority-system/route.ts');
  // @ts-ignore
  await app.register(queueAdminRoutes.default || queueAdminRoutes);
  console.log('[SERVER] Queue priority admin routes registered');

  // Register Message Retry & DLQ Admin API routes (Phase 3 Step 1)
  const retryDlqAdminRoutes = await import('./app/api/message-retry-and-dlq/route.ts');
  // @ts-ignore
  await app.register(retryDlqAdminRoutes.default || retryDlqAdminRoutes, { prefix: '/admin/dlq' });
  console.log('[SERVER] Message retry & DLQ admin routes registered');

  // Register Webhook Dead Letter Queue Admin API routes (Phase 1 Step 5)
  const dlqAdminRoutes = await import('./app/api/webhook-dlq/route.ts');
  // @ts-ignore
  await app.register(dlqAdminRoutes.default || dlqAdminRoutes);
  console.log('[SERVER] Webhook DLQ admin routes registered');

  // Register Immutable Audit Logging API routes (Phase 1 Step 9)
  const auditLogRoutes = await import('./app/api/build-immutable-audit-logging-system/route.ts');
  // @ts-ignore
  await app.register(auditLogRoutes.default || auditLogRoutes, { prefix: '/admin/audit-logs' });
  console.log('[SERVER] Audit log routes registered');

  // Register 2FA Enforcement API routes (Phase 1 Step 10)
  const twoFARoutes = await import('./app/api/enforce-2fa-for-privileged-roles/route.ts');
  // @ts-ignore
  await app.register(twoFARoutes.default || twoFARoutes, { prefix: '/admin/2fa' });
  console.log('[SERVER] 2FA admin routes registered');

  // Register Instance Heartbeat Monitoring API routes (Phase 1 Step 14)
  // @ts-ignore
  const heartbeatInstanceRoutes = await import('./app/api/implement-instance-heartbeat-monitoring/instance.route.ts');
  // @ts-ignore
  await app.register(heartbeatInstanceRoutes.default || heartbeatInstanceRoutes, { prefix: '/api/instances' });
  console.log('[SERVER] Instance heartbeat API routes registered');

  // @ts-ignore
  const heartbeatAdminRoutes = await import('./app/api/implement-instance-heartbeat-monitoring/admin.route.ts');
  // @ts-ignore
  await app.register(heartbeatAdminRoutes.default || heartbeatAdminRoutes, { prefix: '/admin/instances' });
  console.log('[SERVER] Instance heartbeat admin routes registered');

  // Register Connection Pool Optimization Admin API routes (Phase 2 Step 9)
  const poolAdminRoutes = await import('./app/api/implement-connection-pool-optimization/route.ts');
  // @ts-ignore
  await app.register(poolAdminRoutes.default || poolAdminRoutes);
  console.log('[SERVER] Connection pool admin routes registered');

  // Register Workflow Orchestration Admin API routes (Phase 3 Step 3)
  const workflowRoutes = await import('./app/api/workflow-orchestration/route.ts');
  // @ts-ignore
  await app.register(workflowRoutes.default || workflowRoutes, { prefix: '/admin/workflows' });
  console.log('[SERVER] Workflow orchestration admin routes registered');

  // Register Invoice Generation & Download Admin API routes (Phase 3 Step 4)
  const invoiceRoutes = await import('./app/api/build-invoice-generation-&-download/route.ts');
  // @ts-ignore
  await app.register(invoiceRoutes.default || invoiceRoutes, { prefix: '/admin/invoices' });
  console.log('[SERVER] Invoice generation & download admin routes registered');

////  // Register Usage-Based Billing & Overage API routes (Phase 3 Step 5)
////  const usageRoutes = await import('./app/api/implement-usage-based-billing-&-overage/route.ts');
////  // @ts-ignore
////  await app.register(usageRoutes.default || usageRoutes, { prefix: '/api/usage' });
////  console.log('[SERVER] Usage-based billing routes registered');
////
////  // Register Usage-Based Billing Admin API routes (Phase 3 Step 5 - Paystack)
////  const usageAdminRoutes = await import('./app/api/implement-usage-based-billing-&-overage/admin.route.ts');
////  // @ts-ignore
////  await app.register(usageAdminRoutes.default || usageAdminRoutes, { prefix: '/admin/usage' });
////  console.log('[SERVER] Usage-based billing admin routes registered');
////
////  // Register Tax Integration API routes (Phase 3 Step 6)
////  const taxRoutes = await import('./app/api/tax-integration/route.ts');
////  // @ts-ignore
////  await app.register(taxRoutes.default || taxRoutes, { prefix: '/api/tax' });
////  console.log('[SERVER] Tax integration routes registered');
////
////  // Register Billing Admin Dashboard API routes (Phase 3 Step 7)
////  const billingAdminRoutes = await import('./app/api/build-billing-admin-dashboard/route.ts');
////  // @ts-ignore
////  await app.register(billingAdminRoutes.default || billingAdminRoutes, { prefix: '/admin/billing' });
////  console.log('[SERVER] Billing admin dashboard routes registered');
////
////  // Register Feature Management Admin API routes (Phase 3 Step 8.5)
////  const featureRoutes = await import('./app/api/admin/features/route.ts');
////  // @ts-ignore
////  await app.register(featureRoutes.default || featureRoutes, { prefix: '/admin/features' });
////  console.log('[SERVER] Feature management admin routes registered');
//
//  // Register Payment Method Management API routes (Phase 3 Step 8)
//  const paymentMethodRoutes = await import('./app/api/implement-card-updates-&-payment-method-management/route.ts');
//  // @ts-ignore
//  await app.register(paymentMethodRoutes.default || paymentMethodRoutes, { prefix: '/api/payment-methods' });
//  console.log('[SERVER] Payment method management routes registered');
//
//  // Register Coupon & Discount System API routes (Phase 3 Step 9)
//  const couponRoutes = await import('./app/api/build-coupon-&-discount-system/route.ts');
//  // @ts-ignore
//  await app.register(couponRoutes.default || couponRoutes, { prefix: '/api/coupons' });
//  console.log('[SERVER] Coupon & discount system routes registered');

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: 'Not Found' });
  });

  console.log('[SERVER] Finalizing Fastify boot sequence (calling app.ready())...');
  // Finalize Fastify boot sequence - must be after all routes/hooks are registered
  await app.ready();
  console.log('[SERVER] Fastify boot sequence completed');

  return app;
}

// Helper to get __dirname in ES modules
function dirname(path: string): string {
  return path.substring(0, path.lastIndexOf('/'));
}

// Start server
const start = async () => {
  try {
    const app = await buildServer();
    const port = parseInt(process.env.PORT || '9403', 10);

    // Use Fastify's built-in HTTP server creation via listen()
    // This ensures proper setup of request handling and event listeners
    await app.listen({ port, host: '0.0.0.0' });

    // After listen, the underlying http.Server is available as app.server
    const server = app.server;
    if (!server) throw new Error('Server not available');

    console.log(`🚀 WhatsApp Platform Backend running on port ${port}`);
    console.log(`📡 Webhook endpoint: POST /api/webhooks/evolution`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/socket.io/`);
    console.log(`🔐 Health check: GET /health`);

    // DIAGNOSTIC: Add raw HTTP listener after server is listening
    server.on('request', (req, res) => {
      console.log(`[RAW HTTP] ${req.method} ${req.url}`);
    });

    // Initialize Socket.IO for real-time messaging
    try {
      const { initializeSocket, getSocketService } = await import('./lib/build-real-time-messaging-with-socket.io/index.js');
      await initializeSocket(server);
      console.log("🔌 Socket.IO initialized");

      // Inject socket service into status manager for WebSocket notifications
      try {
        const { setSocketService } = await import('./lib/message-status-tracking/status-manager.js');
        setSocketService(getSocketService());
        console.log("📡 Status tracking WebSocket integration enabled");
      } catch (err) {
        console.warn("⚠️ Status tracking WebSocket integration not available:", err.message);
      }
    } catch (err) {
      console.error("⚠️ Failed to initialize Socket.IO:", err);
    }

    // Start Message Queue Worker (BullMQ)
    try {
      const { startWorker } = await import('./lib/message-queue-priority-system/consumer.js');
      startWorker();
      console.log('📨 Message queue worker started');
    } catch (err) {
      console.warn('⚠️ Message queue worker not available:', err.message);
    }

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await app.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// If this file is the main entry point, start the server
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}

export { buildServer };
