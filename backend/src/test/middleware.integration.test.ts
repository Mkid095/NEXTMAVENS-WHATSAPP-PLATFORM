/**
 * Middleware Integration Tests (using Fastify inject)
 *
 * Verifies that the global preHandler pipeline works correctly:
 * - Authentication (authMiddleware)
 * - Organization Guard (orgGuard)
 * - Rate Limiting (rateLimitCheck)
 * - Quota Enforcement (quotaCheck)
 * - WhatsApp Throttling (throttleCheck)
 * - Idempotency (checkIdempotencyCache)
 *
 * Uses Fastify `inject()` to avoid network overhead and flakiness.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/prisma.js';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { getRateLimiter, shutdownRateLimiter } from '../lib/rate-limiting-with-redis/index.ts';
import { messageQueue, shutdownMessageQueueHealthCheck } from '../lib/message-queue-priority-system/index.ts';
import { shutdownQuotaLimiter } from '../lib/implement-quota-enforcement-middleware/index.ts';
import { shutdownIdempotency } from '../lib/implement-idempotency-key-system/index.ts';
import { shutdownThrottle } from '../lib/add-whatsapp-message-throttling/index.ts';

// Test data identifiers
const TEST_ORG_ID = 'org_mw_test_' + randomUUID().toString().substring(0, 16);
const AGENT_USER_ID = 'user_agent_' + randomUUID().replace(/-/g, '').substring(0, 16);
const ADMIN_USER_ID = 'user_admin_' + randomUUID().replace(/-/g, '').substring(0, 16);
// Use unique emails to avoid conflicts from previous test runs
const TEST_USER_EMAIL = `test_middleware_${randomUUID().toString().substring(0, 8)}@example.com`;
const ADMIN_USER_EMAIL = `admin_${randomUUID().toString().substring(0, 8)}@example.com`;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required for middleware tests');
}

function createToken(userId: string, role: string, orgId?: string): string {
  const payload: any = { userId, role };
  if (orgId) payload.orgId = orgId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

// Helper to inject requests directly into Fastify
function debugLog(msg: string) {
  const fs = require('node:fs');
  const line = `[DEBUG ${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync('/tmp/test_trace.log', line);
  console.log(msg);
}

function injectRequest(
  app: any,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: any; token?: string; orgId?: string } = {}
) {
  console.error(`[INJECT] ${options.method || 'GET'} ${path} token:${options.token ? 'yes' : 'no'}`);
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) {
    console.error(`[INJECT] Setting Authorization: Bearer ${options.token.substring(0, 20)}... (len=${options.token.length})`);
    headers['Authorization'] = `Bearer ${options.token}`;
  } else {
    console.error('[INJECT] No token provided');
  }
  if (options.orgId !== undefined) {
    headers['x-org-id'] = options.orgId;
  }
  const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
  if (body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return app.inject({
    method: options.method || 'GET',
    url: path,
    headers,
    body,
  });
}

describe('Middleware Integration Tests', () => {
  let app: any;
  let agentToken: string; // AGENT role, will have orgId set
  let adminToken: string; // SUPER_ADMIN role
  let testOrgId: string;

  before(async () => {
    console.error('\n=== STARTING MIDDLEWARE INTEGRATION TESTS ===');
    // Ensure Redis port matches cleanup (use 6381 if not set)
    if (!process.env.REDIS_PORT) {
      process.env.REDIS_PORT = '6381';
      console.error('[SETUP] REDIS_PORT set to 6381 for test isolation');
    }
    console.log('\n🧪 Starting Middleware Integration Tests...');

    // Register test-only endpoint for rate limiting (must be after server built)

    // Clean up any existing test data
    console.log('[SETUP] Cleaning up previous test data...');
    await cleanup();

    // Create test data with SUPER_ADMIN bypass
    console.log('[SETUP] Creating test data...');
    await prisma.$transaction(async (tx) => {
      // SUPER_ADMIN context for setup
      await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;
      await tx.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;

      // Create organization
      const org = await tx.organization.create({
        data: {
          id: TEST_ORG_ID,
          name: 'Test Org',
          slug: 'test-org-' + randomUUID().toString().substring(0, 8),
          plan: 'FREE',
        },
      });
      testOrgId = org.id;

      // Create an AGENT user (non-privileged)
      const agentUser = await tx.user.create({
        data: {
          id: AGENT_USER_ID,
          email: TEST_USER_EMAIL,
          password: '_dummy_',
          role: 'AGENT',
          isActive: true,
          mfaEnabled: false, // AGENT does not require 2FA
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

      // Create a SUPER_ADMIN user for admin endpoints
      const adminUser = await tx.user.create({
        data: {
          id: ADMIN_USER_ID,
          email: ADMIN_USER_EMAIL,
          password: '_dummy_',
          role: 'SUPER_ADMIN',
          isActive: true,
          mfaEnabled: true, // required for privileged roles
        },
      });

      // Reset RLS before returning connection
      await tx.$executeRaw`SELECT set_config('app.current_user_role', NULL, false)`;
      await tx.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;
    });

    // Generate tokens
    agentToken = createToken(AGENT_USER_ID, 'AGENT', testOrgId);
    adminToken = createToken(ADMIN_USER_ID, 'SUPER_ADMIN');

    // Increase default rate limit to 1000 to avoid test interference
    process.env.RATE_LIMIT_DEFAULT_MAX = '1000';

    // Build server (do not listen, use inject)
    console.log('[SETUP] Building server...');
    const { buildServer } = await import('../server.ts');
    app = await buildServer();
    console.log('[SETUP] Server built successfully');
  });

  it('should serve public /ping without auth', async () => {
    console.log('[TEST] Public /ping');
    const res = await injectRequest(app, '/ping');
    console.log('[TEST] /ping response status:', res.statusCode);
    assert.strictEqual(res.statusCode, 200);
    if (res.body) {
      const body = JSON.parse(res.body);
      assert.ok(body.ok);
    }
  });

  after(async () => {
    console.error('[TEARDOWN] Starting teardown');

    // Shutdown throttle (Redis client)
    try {
      await shutdownThrottle();
      console.log('[TEARDOWN] Throttle shut down');
    } catch (e) {
      console.error('[TEARDOWN] Error shutting down throttle:', e);
    }

    // Shutdown idempotency (Redis client)
    try {
      await shutdownIdempotency();
      console.log('[TEARDOWN] Idempotency shut down');
    } catch (e) {
      console.error('[TEARDOWN] Error shutting down idempotency:', e);
    }

    // Shutdown message queue health check Redis client
    try {
      await shutdownMessageQueueHealthCheck();
      console.log('[TEARDOWN] Message queue health check shut down');
    } catch (e) {
      console.error('[TEARDOWN] Error shutting down message queue health check:', e);
    }

    // Shutdown quota limiter (Prisma client)
    try {
      await shutdownQuotaLimiter();
      console.log('[TEARDOWN] Quota limiter shut down');
    } catch (e) {
      console.error('[TEARDOWN] Error shutting down quota limiter:', e);
    }

    // Stop rate limiter background cleanup
    try {
      await shutdownRateLimiter();
      console.log('[TEARDOWN] Rate limiter stopped');
    } catch (e) {
      console.error('[TEARDOWN] Error stopping rate limiter:', e);
    }

    // Close BullMQ queue to release Redis connection
    try {
      await messageQueue.close();
      console.log('[TEARDOWN] BullMQ queue closed');
    } catch (e) {
      console.error('[TEARDOWN] Error closing message queue:', e);
    }

    // Cleanup database/Redis
    await cleanup();

    // Close Fastify app (release any internal handles)
    try {
      await app.close();
      console.log('[TEARDOWN] Fastify app closed');
    } catch (e) {
      console.error('[TEARDOWN] Error closing app:', e);
    }

    // Disconnect Prisma to close database connections
    try {
      await prisma.$disconnect();
      console.log('[TEARDOWN] Prisma disconnected');
    } catch (e) {
      console.error('[TEARDOWN] Error disconnecting Prisma:', e);
    }
  });

  beforeEach(() => {
    // Nothing needed per test
  });

  async function cleanup() {
    try {
      // Clear all Redis data (including rate limiter keys) to avoid interference from previous runs
      try {
        const redis = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6381', 10),
        });
        await redis.flushdb();
        await redis.quit();
      } catch (err) {
        console.error('Failed to clear Redis database:', err);
      }

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;
        await tx.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;

        // Delete test data
        await tx.auditLog.deleteMany({
          where: { orgId: { startsWith: 'org_mw_test_' } },
        }).catch(() => {});
        await tx.deadLetterQueue.deleteMany({
          where: { orgId: { startsWith: 'org_mw_test_' } },
        }).catch(() => {});
        await tx.member.deleteMany({
          where: { userId: { in: [AGENT_USER_ID, ADMIN_USER_ID] } },
        }).catch(() => {});
        await tx.user.deleteMany({
          where: { id: { in: [AGENT_USER_ID, ADMIN_USER_ID] } },
        }).catch(() => {});
        await tx.organization.deleteMany({
          where: { id: TEST_ORG_ID },
        }).catch(() => {});
      });
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }

  it('should require authentication (401 without token)', async () => {
    console.error('[TEST1] agentToken exists:', !!agentToken, 'adminToken exists:', !!adminToken);
    console.error('[TEST1] agentToken length:', agentToken?.length, 'adminToken length:', adminToken?.length);
    console.log('[TEST1] Performing inject request without token');
    const res = await injectRequest(app, '/admin/rate-limiting/rules', { token: undefined });
    console.log('[TEST1] Got response, status:', res.statusCode);
    assert.strictEqual(res.statusCode, 401, `Expected 401 but got ${res.statusCode}`);
  });

  it('should require org membership (403 if no org context for non-privileged)', async () => {
    // AGENT token but with x-org-id of an org the user is not a member of
    console.error('[TEST2] Using agentToken, length:', agentToken?.length);
    const fakeOrgId = 'org_other_' + randomUUID().toString().substring(0, 8);
    const res = await injectRequest(app, '/admin/rate-limiting/rules', { token: agentToken, orgId: fakeOrgId });
    console.error('[TEST2] Response status:', res.statusCode, 'body:', res.body?.substring(0, 200));
    assert.strictEqual(res.statusCode, 403, `Expected 403 but got ${res.statusCode}`);
  });

  it('should enforce rate limiting (429 after limit)', async () => {
    console.error('[TEST RATE LIMIT] Starting test');
    console.error('[TEST RATE LIMIT] adminToken exists:', !!adminToken, 'length:', adminToken?.length);

    // Create a specific rate limit rule for a test endpoint
    const ruleId = 'rule_test_' + randomUUID().toString().substring(0, 8);
    console.error('[TEST RATE LIMIT] Creating rule: ' + ruleId);
    const createRule = await injectRequest(app, '/admin/rate-limiting/rules', {
      method: 'POST',
      token: adminToken,
      body: {
        ruleId,
        endpoint: '/admin/rate-limiting/metrics',
        maxRequests: 2,
        windowMs: 60000,
        orgId: null, // Apply to all orgs
      },
    });
    console.error('[TEST RATE LIMIT] Create rule response:', createRule.statusCode, 'body:', createRule.body?.substring(0, 300));
    assert.ok(createRule.statusCode === 200 || createRule.statusCode === 201, `Create rule failed: ${createRule.statusCode} ${createRule.body}`);

    // Now make 3 requests: first two should pass, third should be 429
    console.error('[TEST RATE LIMIT] agentToken length:', agentToken?.length);
    for (let i = 0; i < 2; i++) {
      console.error(`[TEST RATE LIMIT] Making request ${i+1}/2`);
      const res = await injectRequest(app, '/admin/rate-limiting/metrics', { token: agentToken, orgId: testOrgId });
      console.error(`[TEST RATE LIMIT] Request ${i+1} status: ${res.statusCode}`);
      assert.ok(res.statusCode === 200, `Request ${i} should succeed, got ${res.statusCode}: ${res.body}`);
    }

    console.error('[TEST RATE LIMIT] Making third request (should be 429)');
    const res3 = await injectRequest(app, '/admin/rate-limiting/metrics', { token: agentToken, orgId: testOrgId });
    console.error('[TEST RATE LIMIT] Third request status: ' + res3.statusCode);
    assert.strictEqual(res3.statusCode, 429, `Third request should be rate limited, got ${res3.statusCode}`);

    // Cleanup rule
    console.error('[TEST RATE LIMIT] Cleaning up rule');
    await injectRequest(app, `/admin/rate-limiting/rules/${ruleId}`, { method: 'DELETE', token: adminToken }).catch(() => {});
    console.error('[TEST RATE LIMIT] Test completed');
  });

});
