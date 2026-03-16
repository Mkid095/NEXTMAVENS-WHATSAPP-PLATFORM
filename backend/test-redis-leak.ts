// Minimal test to identify Redis connection leak
import { prisma } from './src/lib/prisma.js';
import { Redis } from 'ioredis';
import { buildServer } from './src/server.js';
import { shutdownHeartbeatMonitoring } from './src/lib/implement-instance-heartbeat-monitoring/index.js';
import { shutdownQueue } from './src/lib/message-queue-priority-system/index.js';
import { shutdownRateLimiter } from './src/lib/rate-limiting-with-redis/index.js';
import { shutdownIdempotency } from './src/lib/implement-idempotency-key-system/index.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET required');

process.env.RATE_LIMIT_ENABLED = 'false';
process.env.QUOTA_ENABLED = 'false';

let server = null;

async function main() {
  console.log('[DIAG] Building server...');
  server = await buildServer();

  console.log('[DIAG] Server built, waiting 2s...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('[DIAG] Starting shutdown sequence...');

  console.log('[DIAG] 1. Shutting down heartbeat monitoring...');
  await shutdownHeartbeatMonitoring();
  console.log('[DIAG] Heartbeat shutdown complete');

  console.log('[DIAG] 2. Shutting down rate limiter...');
  await shutdownRateLimiter();
  console.log('[DIAG] Rate limiter shutdown complete');

  console.log('[DIAG] 3. Shutting down idempotency...');
  await shutdownIdempotency();
  console.log('[DIAG] Idempotency shutdown complete');

  console.log('[DIAG] 4. Shutting down message queue...');
  await shutdownQueue();
  console.log('[DIAG] Message queue shutdown complete');

  console.log('[DIAG] All shutdown functions complete');
  console.log('[DIAG] Server should have no open handles now');
  console.log('[DIAG] Exiting in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('[DIAG] Goodbye!');
}

main().catch(err => {
  console.error('[DIAG] Error:', err);
  process.exit(1);
});
