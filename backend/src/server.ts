/**
 * NEXTMAVENS WhatsApp Platform - Backend Server
 *
 * Fastify server hosting webhook endpoints and future API routes.
 *
 * Start: npm run dev
 */

import Fastify from 'fastify';
import * as http from 'http';
import { join } from 'path';
import { fileURLToPath } from 'url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rawBody from 'fastify-raw-body';

// Import Prisma to ensure it's initialized
import { prisma, verifyDatabaseSetup } from './lib/prisma.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Security middleware
  await app.register(helmet);

  // CORS - configure appropriately for your frontend
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Raw body plugin for webhook signature verification
  await app.register(rawBody, { global: false }); // per-route usage

  // Health check
  app.get('/health', async (request, reply) => {
    const dbOk = await verifyDatabaseSetup();
    return {
      status: dbOk.ok ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbOk.ok ? 'connected' : 'error',
      errors: dbOk.errors,
    };
  });

  // Register Evolution API webhook routes
  const evolutionRoutes = await import('./app/api/integrate-evolution-api-message-status-webhooks/route.js');
  // @ts-ignore - dynamic import type mismatch
  app.register(evolutionRoutes.default || evolutionRoutes);

  // Register Retry Logic API routes (Step 4)
  const retryLogicRoutes = await import('./app/api/build-retry-logic-with-progressive-backoff/route.js');
  // @ts-ignore
  await app.register(retryLogicRoutes.default || retryLogicRoutes);

  // Register Advanced Phone Number Validation routes (Step 5)
  const phoneValidationRoutes = await import('./app/api/add-advanced-phone-number-validation/route.js');
  // @ts-ignore
  await app.register(phoneValidationRoutes.default || phoneValidationRoutes);

  // Register Message Deduplication System API routes (Step 6)
  const dedupRoutes = await import('./app/api/implement-message-deduplication-system/route.js');
  // @ts-ignore
  await app.register(dedupRoutes.default || dedupRoutes);

  // Register Message Delivery Receipts System API routes (Step 7)
  const receiptRoutes = await import('./app/api/build-message-delivery-receipts-system/route.js');
  // @ts-ignore
  await app.register(receiptRoutes.default || receiptRoutes);

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
    const port = parseInt(process.env.PORT || '3000', 10);

    // Create HTTP server and attach Socket.IO
    // @ts-ignore - Fastify instance compatible with http.ServerRequestListener
    const server = http.createServer(app);

    // Initialize Socket.IO with Redis adapter
    try {
      const { initializeSocket } = await import('./lib/build-real-time-messaging-with-socket.io/index.js');
      await initializeSocket(server);
      console.log("🔌 Socket.IO initialized");
    } catch (err) {
      console.error("⚠️ Failed to initialize Socket.IO:", err);
      // Continue without Socket.IO - logging only
    }

    // @ts-ignore - listen options acceptable
    server.listen({ port, host: '0.0.0.0' }, (err, address) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }
      app.log.info(`Server listening on ${address}`);
      console.log(`🚀 WhatsApp Platform Backend running on port ${port}`);
      console.log(`📡 Webhook endpoint: POST /api/webhooks/evolution`);
      console.log(`🔌 WebSocket endpoint: ws://${address}/socket.io/`);
      console.log(`🔐 Health check: GET /health`);
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
