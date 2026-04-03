/**
 * NEXTMAVENS WhatsApp Platform - Server Entry Point
 *
 * Creates HTTP/HTTPS server and starts the application.
 * Start: npm run dev or npm start
 */

import 'dotenv/config';

import { buildServer } from './app';
import { getConfig } from './shared/config';
import { getPrismaSingleton, disconnectDatabase } from './shared/database';
import logger from './shared/logger';
import { initializeSocket, getSocketService } from './infrastructure/websocket';

async function main() {
  const config = getConfig();
  const prisma = getPrismaSingleton();

  // Build Fastify application
  const app = await buildServer();

  // Start HTTP server
  const server = await app.listen({
    port: parseInt(config.PORT, 10),
    host: '0.0.0.0',
  });

  logger.info(`🚀 WhatsApp Platform Backend running on port ${config.PORT}`);
  logger.info(`📡 Webhook endpoint: POST /api/webhooks/evolution`);
  logger.info(`🔐 Health check: GET /health`);
  logger.info(`📊 Metrics: GET /metrics`);

  // Initialize Socket.IO with the HTTP server
  try {
    await initializeSocket(server as any);
    logger.info(`🔌 WebSocket endpoint: ${config.APP_URL.replace(/^https?/, 'ws')}/socket.io/`);
  } catch (error) {
    logger.error('[SocketIO] Initialization failed:', error);
    // Continue without WebSocket - not critical
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`[Shutdown] Received ${signal}, shutting down gracefully...`);

      try {
        // Close WebSocket connections first
        const socketService = getSocketService();
        if (socketService) {
          await socketService.shutdown();
          logger.info('[Shutdown] WebSocket server closed');
        }

        // Close HTTP server
        await app.close();
        logger.info('[Shutdown] HTTP server closed');

        // Close database connection
        await disconnectDatabase();
        logger.info('[Shutdown] Database disconnected');

        process.exit(0);
      } catch (error) {
        logger.error('[Shutdown] Error during shutdown:', error);
        process.exit(1);
      }
    });
  }
}

main().catch(error => {
  logger.error('[Fatal] Failed to start server:', error);
  process.exit(1);
});
