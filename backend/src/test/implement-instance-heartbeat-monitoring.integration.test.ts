/**
 * Instance Heartbeat Monitoring Integration Tests
 * Tests API endpoints with Fastify inject.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/prisma.js';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { buildServer } from '../server.js';
import { syncInstanceStatuses, shutdownHeartbeatMonitoring } from '../lib/implement-instance-heartbeat-monitoring/index.js';
import { shutdownQueue, shutdownMessageQueueHealthCheck, stopWorker } from '../lib/message-queue-priority-system/index.js';
import { shutdownRateLimiter } from '../lib/rate-limiting-with-redis/index.js';
import { shutdownIdempotency } from '../lib/implement-idempotency-key-system/index.js';

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error('JWT_SECRET required');

function createToken(userId: string, role: string, orgId?: string): string {
  const payload: any = { userId, role };
  if (orgId) payload.orgId = orgId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

// Clear rate limit Redis keys to avoid test interference
async function clearRateLimitKeys(): Promise<void> {
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6381', 10),
      password: process.env.REDIS_PASSWORD,
    });
    const keys = await redis.keys('rate_limit*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  } catch (err) {
    console.warn('[Test] Failed to clear rate limit keys:', err);
  }
}

async function cleanup() {
  await prisma.$transaction(async (tx) => {
    // Set SUPER_ADMIN role to bypass RLS
    await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;
    await tx.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;

    await tx.whatsAppInstance.deleteMany({ where: { id: { in: [TEST_INSTANCE_ID] } } });
    await tx.member.deleteMany({ where: { userId: { in: [TEST_USER_ID, ADMIN_USER_ID] } } });
    await tx.user.deleteMany({ where: { id: { in: [TEST_USER_ID, ADMIN_USER_ID] } } });
    await tx.organization.deleteMany({ where: { id: TEST_ORG_ID } });
  });
}

const TEST_ORG_ID = 'org_heartbeat_test_' + randomUUID().slice(0, 12);
const TEST_INSTANCE_ID = 'inst_hb_test_' + randomUUID().slice(0, 12);
const TEST_USER_ID = 'user_hb_test_' + randomUUID().slice(0, 12);
const ADMIN_USER_ID = 'user_hb_admin_' + randomUUID().slice(0, 12);
// Generate unique email suffixes to avoid conflicts from aborted test runs
const EMAIL_SUFFIX = randomUUID().slice(0, 8);

let app: any;
let instanceToken: string;
let agentToken: string;
let adminToken: string;

describe('Instance Heartbeat Monitoring Integration', () => {
  before(async () => {
    if (!process.env.REDIS_PORT) process.env.REDIS_PORT = '6381';
    // Disable rate limiting and quota for integration tests to avoid false positives
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.QUOTA_ENABLED = 'false';

    await cleanup();

    // Create test data
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;
      await tx.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;

      const org = await tx.organization.create({
        data: {
          id: TEST_ORG_ID,
          name: 'Heartbeat Test Org',
          slug: 'hb-test-' + randomUUID().slice(0, 8),
          plan: 'FREE',
        },
      });

      const instance = await tx.whatsAppInstance.create({
        data: {
          id: TEST_INSTANCE_ID,
          orgId: org.id,
          name: 'Test Instance',
          phoneNumber: `+1${randomUUID().toString().replace(/-/g, '').slice(0, 10)}`,
          status: 'CONNECTED',
          token: `inst_${randomUUID().toString().slice(0, 12)}`,
          heartbeatStatus: 'UNKNOWN',
        },
      });
      instanceToken = instance.token;

      // Agent user (non-admin)
      const agentUser = await tx.user.create({
        data: {
          id: TEST_USER_ID,
          email: `agent_${EMAIL_SUFFIX}@test.com`,
          password: 'hashed',
          role: 'AGENT',
        },
      });
      await tx.member.create({
        data: {
          userId: agentUser.id,
          orgId: org.id,
          role: 'AGENT',
        },
      });
      agentToken = createToken(agentUser.id, 'AGENT', org.id);

      // Admin user (ORG_ADMIN) with 2FA enabled
      const adminUser = await tx.user.create({
        data: {
          id: ADMIN_USER_ID,
          email: `admin_${EMAIL_SUFFIX}@test.com`,
          password: 'hashed',
          role: 'ORG_ADMIN',
          mfaEnabled: true,
        },
      });
      await tx.member.create({
        data: {
          userId: adminUser.id,
          orgId: org.id,
          role: 'ORG_ADMIN',
        },
      });
      adminToken = createToken(adminUser.id, 'ORG_ADMIN', org.id);
    });

    // Build Fastify app
    app = await buildServer();

    // Clear any accumulated rate limit keys from previous test runs
    await clearRateLimitKeys();
  });

  after(async () => {
    // Shutdown all system components in reverse order of initialization
    // to ensure all Redis connections and background workers are closed

    // 1. Heartbeat monitoring (includes its Redis client)
    try {
      await shutdownHeartbeatMonitoring();
    } catch (err) {
      console.warn('[Test] shutdownHeartbeatMonitoring error:', err);
    }

    // 2. Rate limiter (has its own Redis client)
    try {
      await shutdownRateLimiter();
    } catch (err) {
      console.warn('[Test] shutdownRateLimiter error:', err);
    }

    // 3. Idempotency system (has its own Redis client)
    try {
      await shutdownIdempotency();
    } catch (err) {
      console.warn('[Test] shutdownIdempotency error:', err);
    }

    // 3.5. Stop message queue worker (has its own Redis connection)
    try {
      await stopWorker();
    } catch (err) {
      console.warn('[Test] stopWorker error:', err);
    }

    // 4. Message queue system (includes health check Redis)
    try {
      await shutdownQueue();
    } catch (err) {
      console.warn('[Test] shutdownQueue error:', err);
    }
    try {
      await shutdownMessageQueueHealthCheck();
    } catch (err) {
      console.warn('[Test] shutdownMessageQueueHealthCheck error:', err);
    }

    // 5. Database cleanup
    try {
      await cleanup();
    } catch (err) {
      console.warn('[Test] cleanup error:', err);
    }

    // 6. Disconnect Prisma client to close database connection pool
    try {
      await prisma.$disconnect();
      console.log('[Test] Prisma client disconnected');
    } catch (err) {
      console.warn('[Test] Prisma disconnect error:', err);
    }

    // 7. Wait for connections to fully close
    await new Promise(resolve => setTimeout(resolve, 200));

    // Diagnostic: Log active handles to identify what's keeping event loop alive
    const getActiveHandles = (process as any)._getActiveHandles;
    const getActiveRequests = (process as any)._getActiveRequests;
    if (getActiveHandles) {
      const handles = getActiveHandles.call(process);
      const requests = getActiveRequests ? getActiveRequests.call(process) : [];
      console.log('[Test] Shutdown complete. Active handles:', handles.length, 'Active requests:', requests.length);
      if (handles.length > 0) {
        const socketDetails = handles
          .filter((h: any) => h.constructor?.name === 'Socket')
          .map((h: any) => ({
            remoteAddress: h.remoteAddress,
            remotePort: h.remotePort,
            localAddress: h.localAddress,
            localPort: h.localPort,
          }));
        console.log('[Test] Socket details:', JSON.stringify(socketDetails, null, 2));
        // Try destroying sockets if they refuse to close
        handles.forEach((h: any, i: number) => {
          if (h.destroy && h.remoteAddress) {
            try {
              h.destroy();
              console.log(`[Test] Destroyed handle ${i}: ${h.remoteAddress}:${h.remotePort}`);
            } catch (e) {
              // ignore
            }
          }
        });
      }
    }

    // 8. Close Fastify server
    if (app && typeof app.close === 'function') {
      try {
        await app.close();
        console.log('[Test] Fastify server closed');
      } catch (err) {
        console.warn('[Test] Error closing Fastify server:', err);
      }
    }

    // 9. Final check after all cleanup
    await new Promise(resolve => setTimeout(resolve, 200));
    const finalHandles = getActiveHandles ? getActiveHandles.call(process) : [];
    const finalRequests = getActiveRequests ? getActiveRequests.call(process) : [];
    console.log('[Test] Final state - active handles:', finalHandles.length, 'active requests:', finalRequests.length);

    // If we still have handles, force exit after brief wait
    if (finalHandles.length > 0) {
      console.log('[Test] Still have active handles, will force exit in 500ms');
      await new Promise(resolve => setTimeout(resolve, 500));
      process.exit(0);
    }
  });

  describe('POST /api/instances/:id/heartbeat', () => {
    it('should accept valid token and update heartbeat', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/instances/${TEST_INSTANCE_ID}/heartbeat`,
        headers: { 'Authorization': `Bearer ${instanceToken}` },
        payload: {},
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.instanceId, TEST_INSTANCE_ID);

      // Verify DB updated
      const inst = await prisma.whatsAppInstance.findUnique({
        where: { id: TEST_INSTANCE_ID },
      });
      assert.ok(inst.lastSeen);
      assert.strictEqual(inst.heartbeatStatus, 'ONLINE');
    });

    it('should reject missing token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/instances/${TEST_INSTANCE_ID}/heartbeat`,
        payload: {},
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('should reject invalid token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/instances/${TEST_INSTANCE_ID}/heartbeat`,
        headers: { 'Authorization': 'Bearer wrong_token' },
        payload: {},
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('should return 404 for non-existent instance', async () => {
      const fakeId = 'inst_nonexistent';
      const res = await app.inject({
        method: 'POST',
        url: `/api/instances/${fakeId}/heartbeat`,
        headers: { 'Authorization': `Bearer ${instanceToken}` },
        payload: {},
      });
      assert.strictEqual(res.statusCode, 404);
    });

    it('should accept metrics in payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/instances/${TEST_INSTANCE_ID}/heartbeat`,
        headers: { 'Authorization': `Bearer ${instanceToken}` },
        payload: {
          metrics: { cpu: 0.5, memory: 0.7, queueSize: 10, uptime: 3600 },
        },
      });
      assert.strictEqual(res.statusCode, 200);
    });
  });

  describe('GET /admin/instances/heartbeat', () => {
    it('should return status list for admin', async () => {
      // Ensure statuses are synced
      await syncInstanceStatuses();

      const res = await app.inject({
        method: 'GET',
        url: '/admin/instances/heartbeat',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data.instances));
      assert.ok(body.data.summary);
      assert.strictEqual(body.data.summary.total >= 1, true);
    });

    it('should filter by org for ORG_ADMIN', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/instances/heartbeat',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      const body = JSON.parse(res.body);
      for (const inst of body.data.instances) {
        assert.strictEqual(inst.orgId, TEST_ORG_ID);
      }
    });

    it('should reject unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/instances/heartbeat',
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('should reject agent role (non-admin)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/instances/heartbeat',
        headers: { 'Authorization': `Bearer ${agentToken}` },
      });
      assert.ok(res.statusCode === 401 || res.statusCode === 403);
    });

    it('should support status filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/instances/heartbeat?status=ONLINE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      const body = JSON.parse(res.body);
      for (const inst of body.data.instances) {
        assert.strictEqual(inst.status, 'ONLINE');
      }
    });
  });
});
