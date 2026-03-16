/**
 * Chat Pagination Integration Tests
 *
 * Tests the full API endpoint with Fastify inject().
 * Uses test database with seeded chat data.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/prisma.js';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { getRateLimiter, shutdownRateLimiter } from '../lib/rate-limiting-with-redis/index.ts';
import { messageQueue } from '../lib/message-queue-priority-system/index.ts';
import { shutdownQuotaLimiter } from '../lib/implement-quota-enforcement-middleware/index.ts';
import { shutdownIdempotency } from '../lib/implement-idempotency-key-system/index.ts';
import { shutdownThrottle } from '../lib/add-whatsapp-message-throttling/index.ts';

// Test data
const TEST_ORG_ID = 'org_chat_pg_test_' + randomUUID().toString().substring(0, 16);
const AGENT_USER_ID = 'user_agent_chat_' + randomUUID().replace(/-/g, '').substring(0, 16);
const ADMIN_USER_ID = 'user_admin_chat_' + randomUUID().replace(/-/g, '').substring(0, 16);
const TEST_USER_EMAIL = `test_chat_pg_${randomUUID().toString().substring(0, 8)}@example.com`;
const ADMIN_USER_EMAIL = `admin_chat_${randomUUID().toString().substring(0, 8)}@example.com`;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required for chat pagination integration tests');
}

function createToken(userId: string, role: string, orgId?: string): string {
  const payload: any = { userId, role };
  if (orgId) payload.orgId = orgId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

function debugLog(msg: string) {
  const fs = require('node:fs');
  const line = `[CHAT PG TEST ${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync('/tmp/chat_pg_test.log', line);
  console.log(msg);
}

function injectRequest(
  app: any,
  path: string,
  options: { method?: string; headers?: Record<string, string>; token?: string; orgId?: string } = {}
) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.orgId !== undefined) {
    headers['x-org-id'] = options.orgId;
  }
  return app.inject({
    method: options.method || 'GET',
    url: path,
    headers
  });
}

describe('Chat Pagination Integration Tests', () => {
  let app: any;
  let agentToken: string;
  let adminToken: string;
  let testOrgId: string;
  let testInstanceId: string;
  let otherUserId: string;

  before(async () => {
    console.error('\n=== STARTING CHAT PAGINATION INTEGRATION TESTS ===');
    if (!process.env.REDIS_PORT) {
      process.env.REDIS_PORT = '6381';
      debugLog('[SETUP] REDIS_PORT set to 6381');
    }

    debugLog('[SETUP] Cleaning up previous test data...');
    await cleanup();

    debugLog('[SETUP] Creating test data...');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;
      await tx.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;

      // Create organization
      const org = await tx.organization.create({
        data: {
          id: TEST_ORG_ID,
          name: 'Chat Pagination Test Org',
          slug: 'chat-pg-test-' + randomUUID().toString().substring(0, 8),
          plan: 'FREE',
        },
      });
      testOrgId = org.id;

      // Create a WhatsApp instance for this org
      const instance = await tx.whatsAppInstance.create({
        data: {
          id: 'inst_chat_pg_' + randomUUID().toString().substring(0, 12),
          orgId: testOrgId,
          name: 'Test Instance',
          phoneNumber: '+1234567890',
          status: 'CONNECTED',
        },
      });
      testInstanceId = instance.id;

      // Create 50 test chat messages with varying timestamps
      const now = new Date();
      const chats = [];
      for (let i = 0; i < 50; i++) {
        const createdAt = new Date(now.getTime() - i * 5 * 60 * 1000); // 5 min apart
        chats.push({
          id: 'chat_pg_' + randomUUID(),
          chatId: 'chat_pg_' + randomUUID(),
          orgId: testOrgId,
          instanceId: testInstanceId,
          phone: `+123456789${i.toString().padStart(4, '0')}`,
          lastMessageAt: createdAt,
          unreadCount: i % 3 === 0 ? 1 : 0,
          isGroup: false,
          isArchived: false,
          isPinned: false,
          metadata: null,
          createdAt,
          updatedAt: createdAt,
        });
      }
      // Insert in reverse order so newest is first after ordering
      for (const chat of chats.reverse()) {
        await tx.whatsAppChat.create({ data: chat });
      }

      // Create an AGENT user
      const agentUser = await tx.user.create({
        data: {
          id: AGENT_USER_ID,
          email: TEST_USER_EMAIL,
          password: '_dummy_',
          role: 'AGENT',
          isActive: true,
          mfaEnabled: false,
        },
      });

      // Create membership for agent
      await tx.member.create({
        data: {
          userId: agentUser.id,
          orgId: testOrgId,
          role: 'AGENT',
        },
      });

      // Create a SUPER_ADMIN user
      const adminUser = await tx.user.create({
        data: {
          id: ADMIN_USER_ID,
          email: ADMIN_USER_EMAIL,
          password: '_dummy_',
          role: 'SUPER_ADMIN',
          isActive: true,
          mfaEnabled: true,
        },
      });

      // Create another org and user for testing org context rejection
      const otherOrg = await tx.organization.create({
        data: {
          id: 'org_chat_pg_other_' + randomUUID().toString().substring(0, 12),
          name: 'Other Org',
          slug: 'other-org-' + randomUUID().toString().substring(0, 8),
          plan: 'FREE',
        },
      });
      otherUserId = 'user_other_' + randomUUID().toString().substring(0, 8);
      const otherUser = await tx.user.create({
        data: {
          id: otherUserId,
          email: `other-${otherUserId}@example.com`,
          password: '_dummy_',
          role: 'AGENT',
          isActive: true,
          mfaEnabled: false,
        },
      });
      await tx.member.create({
        data: {
          userId: otherUser.id,
          orgId: otherOrg.id,
          role: 'AGENT',
        },
      });

      await tx.$executeRaw`SELECT set_config('app.current_user_role', NULL, false)`;
      await tx.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;
    });

    agentToken = createToken(AGENT_USER_ID, 'AGENT', testOrgId);
    adminToken = createToken(ADMIN_USER_ID, 'SUPER_ADMIN');

    process.env.RATE_LIMIT_DEFAULT_MAX = '1000';

    debugLog('[SETUP] Building server...');
    const { buildServer } = await import('../server.ts');
    app = await buildServer();
    debugLog('[SETUP] Server built successfully');
  });

  it('should list chats with pagination', async () => {
    const res = await injectRequest(app, '/api/chats', {
      token: agentToken,
      orgId: testOrgId,
      headers: { 'x-instance-id': testInstanceId }
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data.chats));
    assert.strictEqual(body.data.chats.length, 50); // default limit 50, but we only have 20

    // Should return chats in descending order (newest first)
    for (let i = 0; i < body.data.chats.length - 1; i++) {
      assert.ok(
        new Date(body.data.chats[i].createdAt) >= new Date(body.data.chats[i + 1].createdAt),
        'Chats not in descending order'
      );
    }

    // Verify pagination metadata
    assert.ok(body.data.pagination);
    assert.ok(typeof body.data.pagination.nextCursor === 'string' || body.data.pagination.nextCursor === null);
    assert.ok(typeof body.data.pagination.prevCursor === 'string' || body.data.pagination.prevCursor === null);
    assert.strictEqual(typeof body.data.pagination.hasMore, 'boolean');
    assert.strictEqual(body.data.pagination.limit, 50);
  });

  it('should respect custom limit', async () => {
    const res = await injectRequest(app, '/api/chats?limit=5', {
      token: agentToken,
      orgId: testOrgId,
      headers: { 'x-instance-id': testInstanceId }
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.data.chats.length, 5);
    assert.strictEqual(body.data.pagination.limit, 5);
  });

  it('should enforce max limit 100', async () => {
    const res = await injectRequest(app, '/api/chats?limit=200', {
      token: agentToken,
      orgId: testOrgId,
      headers: { 'x-instance-id': testInstanceId }
    });

    const body = JSON.parse(res.body);
    // Should fail with 400 if limit > 100? Or just clamp?
    // Our implementation throws in validation
    assert.strictEqual(res.statusCode, 400);
    assert.ok(body.error || body.success === false);
  });

  it('should require x-instance-id header', async () => {
    const res = await injectRequest(app, '/api/chats', {
      token: agentToken,
      orgId: testOrgId
    });

    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'Instance ID header (x-instance-id) is required');
  });

  it('should paginate correctly with next cursor', async () => {
    // Get first page
    const page1 = await injectRequest(app, '/api/chats?limit=5', {
      token: agentToken,
      orgId: testOrgId,
      headers: { 'x-instance-id': testInstanceId }
    });
    const body1 = JSON.parse(page1.body);
    assert.strictEqual(body1.data.chats.length, 5);
    const nextCursor = body1.data.pagination.nextCursor;
    assert.ok(nextCursor);

    // Get second page
    const page2 = await injectRequest(app, `/api/chats?cursor=${nextCursor}&limit=5`, {
      token: agentToken,
      orgId: testOrgId,
      headers: { 'x-instance-id': testInstanceId }
    });
    const body2 = JSON.parse(page2.body);
    assert.strictEqual(body2.data.chats.length, 5);

    // Verify no overlap: page2 chats should be older than page1 chats
    const page1Max = new Date(body1.data.chats[0].createdAt).getTime();
    const page2Min = new Date(body2.data.chats[body2.data.chats.length - 1].createdAt).getTime();
    assert.ok(page2Min < page1Max, 'Page 2 chats should be older than page 1 chats');
  });

  it('should handle empty dataset', async () => {
    // Use a non-existent instance ID
    const res = await injectRequest(app, '/api/chats', {
      token: agentToken,
      orgId: testOrgId,
      headers: { 'x-instance-id': 'non-existent-instance' }
    });

    const body = JSON.parse(res.body);
    assert.strictEqual(body.data.chats.length, 0);
    assert.strictEqual(body.data.pagination.nextCursor, null);
    assert.strictEqual(body.data.pagination.hasMore, false);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await injectRequest(app, '/api/chats', {
      orgId: testOrgId,
      headers: { 'x-instance-id': testInstanceId }
    });
    assert.strictEqual(res.statusCode, 401);
  });

  it('should reject requests without org context', async () => {
    const otherOrgToken = createToken(otherUserId, 'AGENT'); // User belongs to other org
    const res = await injectRequest(app, '/api/chats', {
      token: otherOrgToken,
      orgId: testOrgId,
      headers: { 'x-instance-id': testInstanceId }
    });
    assert.strictEqual(res.statusCode, 403); // orgGuard will reject
  });

  after(async () => {
    debugLog('[TEARDOWN] Starting teardown');

    try {
      await shutdownThrottle();
      debugLog('[TEARDOWN] Throttle shut down');
    } catch (e) {
      debugLog(`[TEARDOWN] Error shutting down throttle: ${e}`);
    }

    try {
      await shutdownIdempotency();
      debugLog('[TEARDOWN] Idempotency shut down');
    } catch (e) {
      debugLog(`[TEARDOWN] Error shutting down idempotency: ${e}`);
    }

    try {
      await shutdownQuotaLimiter();
      debugLog('[TEARDOWN] Quota limiter shut down');
    } catch (e) {
      debugLog(`[TEARDOWN] Error shutting down quota limiter: ${e}`);
    }

    try {
      await shutdownRateLimiter();
      debugLog('[TEARDOWN] Rate limiter stopped');
    } catch (e) {
      debugLog(`[TEARDOWN] Error stopping rate limiter: ${e}`);
    }

    try {
      await messageQueue.close();
      debugLog('[TEARDOWN] BullMQ queue closed');
    } catch (e) {
      debugLog(`[TEARDOWN] Error closing message queue: ${e}`);
    }

    await cleanup();

    try {
      await app.close();
      debugLog('[TEARDOWN] Fastify app closed');
    } catch (e) {
      debugLog(`[TEARDOWN] Error closing app: ${e}`);
    }

    try {
      await prisma.$disconnect();
      debugLog('[TEARDOWN] Prisma disconnected');
    } catch (e) {
      debugLog(`[TEARDOWN] Error disconnecting Prisma: ${e}`);
    }
  });

  async function cleanup() {
    try {
      // Flush Redis
      try {
        const redis = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6381', 10),
        });
        await redis.flushdb();
        await redis.quit();
      } catch (err) {
        debugLog(`Failed to clear Redis database: ${err}`);
      }

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;
        await tx.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;

        await tx.whatsAppChat.deleteMany({
          where: { orgId: { startsWith: 'org_' } }
        }).catch(() => {});
        await tx.whatsAppInstance.deleteMany({
          where: { orgId: { startsWith: 'org_' } }
        }).catch(() => {});
        await tx.auditLog.deleteMany({
          where: { orgId: { startsWith: 'org_'} }
        }).catch(() => {});
        await tx.member.deleteMany({
          where: { userId: { in: [AGENT_USER_ID, ADMIN_USER_ID] } }
        }).catch(() => {});
        await tx.user.deleteMany({
          where: { id: { in: [AGENT_USER_ID, ADMIN_USER_ID] } }
        }).catch(() => {});
        await tx.organization.deleteMany({
          where: { id: TEST_ORG_ID }
        }).catch(() => {});
      });
    } catch (e) {
      debugLog(`Cleanup error: ${e}`);
    }
  }
});
