/**
 * NEXTMAVENS WhatsApp Platform - Backend Server
 *
 * Fastify server hosting webhook endpoints and future API routes.
 *
 * Start: npm run dev
 */

import Fastify from 'fastify';
import { join } from 'path';
import { fileURLToPath } from 'url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

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
  app.register(evolutionRoutes.default || evolutionRoutes);

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

    app.listen({ port, host: '0.0.0.0' }, (err, address) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }
      app.log.info(`Server listening on ${address}`);
      console.log(`🚀 WhatsApp Platform Backend running on port ${port}`);
      console.log(`📡 Webhook endpoint: POST /api/webhooks/evolution`);
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
