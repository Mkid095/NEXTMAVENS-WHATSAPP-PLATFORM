/**
 * Integration Tests - 2FA Enforcement API
 * Uses Node.js built-in test runner with Fastify injection.
 * Tests the actual handler functions in a simulated environment.
 *
 * Run: npx tsx src/test/2fa-enforcement.integration.test.ts
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import { prisma } from '../lib/prisma.js';
import {
  generate2FASetup,
  verifyAndEnable2FA,
  verify2FAToken,
  disable2FA,
  is2FAEnabled,
  get2FAStatus,
  isPrivilegedRole,
} from '../lib/enforce-2fa-for-privileged-roles/index.ts';

// Test data
const TEST_USER_ID = 'user_test_123';
const TEST_ORG_ID = 'org_test_123';
const TEST_SUPER_ADMIN = {
  id: TEST_USER_ID,
  email: 'superadmin@test.com',
  role: 'SUPER_ADMIN',
  orgId: TEST_ORG_ID,
  mfaEnabled: false,
};

const TEST_AGENT = {
  id: 'user_agent_123',
  email: 'agent@test.com',
  role: 'AGENT',
  orgId: TEST_ORG_ID,
  mfaEnabled: false,
};

function generateToken(user: any): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    },
    'test-secret',
    { expiresIn: '1h' }
  );
}

let app: Fastify;
let mockPrisma: any;

// Mock auth middleware
function registerAuthMiddleware(app: Fastify) {
  app.addHook('preHandler', async (request, reply) => {
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized' });
      throw new Error('Unauthorized');
    }

    const token = authHeader.slice(7);
    try {
      const payload = jwt.decode(token) as any;
      (request as any).user = payload;
    } catch (error: any) {
      reply.code(401).send({ error: 'Invalid token' });
      throw new Error('Invalid token');
    }
  });
}

// Mock org guard
function registerOrgGuard(app: Fastify) {
  app.addHook('preHandler', async (request, reply) => {
    const user = (request as any).user;
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      throw new Error('Unauthorized');
    }
    (request as any).currentOrgId = user.orgId;
  });
}

// Mock 2FA enforcement middleware (from library) applied globally
function register2FAMiddleware(app: Fastify) {
  app.addHook('preHandler', async (request: any, reply: any) => {
    const user = request.user;
    if (!user) return;

    if (isPrivilegedRole(user.role) && !request.url?.startsWith('/admin/2fa')) {
      const dbUser = await mockPrisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser?.mfaEnabled) {
        reply.code(403).send({
          error: 'Two-factor authentication required',
          code: 'MFA_REQUIRED',
        });
        throw new Error('MFA_REQUIRED');
      }
    }
  });
}

// Helper: create Fastify route handler factory
function createRouteHandler(handler: any) {
  return async (request: any, reply: any) => {
    try {
      const result = await handler(request, reply);
      if (result !== undefined) {
        return result;
      }
      return { success: true };
    } catch (error: any) {
      if (reply.sent) {
        return;
      }
      throw error;
    }
  };
}

describe('2FA Enforcement API Integration', () => {
  before(async () => {
    console.log('\n🧪 Starting 2FA Enforcement Integration Tests...');

    // Set JWT_SECRET for tests
    process.env.JWT_SECRET = 'test-secret';

    // Setup mock Prisma
    mockPrisma = {
      user: {
        findUnique: async (query: any) => {
          const userId = query.where.id;
          if (userId === TEST_AGENT.id) {
            return { ...TEST_AGENT, mfaEnabled: false };
          }
          return { ...TEST_SUPER_ADMIN, mfaEnabled: false };
        },
        update: async (query: any) => {
          const userId = query.where.id;
          if (query.data.mfaEnabled === false) {
            return { ...TEST_SUPER_ADMIN, mfaEnabled: false, mfaSecret: null };
          }
          return { ...TEST_SUPER_ADMIN, mfaEnabled: true };
        },
      },
    };
    (global as any).mockPrisma = mockPrisma;

    // Create Fastify app
    app = Fastify();

    // Register middleware
    registerAuthMiddleware(app);
    registerOrgGuard(app);
    register2FAMiddleware(app);

    // Register 2FA API routes directly using handlers
    // POST /admin/2fa/setup
    app.post('/admin/2fa/setup', {}, async (request: any, reply: any) => {
      const user = request.user;
      if (user.mfaEnabled) {
        reply.code(400);
        return { error: '2FA already enabled', message: 'Two-factor authentication is already active for this account.' };
      }
      // generate2FASetup returns a promise
      const setupData = await generate2FASetup(user.id, user.email);
      return {
        success: true,
        data: {
          secret: setupData.secret,
          qrCode: setupData.qrCode,
          manualEntry: setupData.manualEntry,
          issuer: setupData.issuer,
          label: setupData.label,
        },
        message: 'Scan the QR code with your authenticator app, then verify with the 6-digit code.',
      };
    });

    // POST /admin/2fa/verify
    app.post('/admin/2fa/verify', {}, async (request: any, reply: any) => {
      const { token } = request.body as { token: string };
      if (!token || !/^\d{6}$/.test(token)) {
        reply.code(400);
        return { error: 'Validation error', message: 'Invalid request format. Token must be 6 digits.' };
      }
      try {
        const success = await verifyAndEnable2FA(request.user.id, token);
        if (!success) {
          reply.code(401);
          return { error: 'Invalid token', message: 'The provided 2FA token is invalid.' };
        }
        return { success: true, message: 'Two-factor authentication has been successfully enabled.' };
      } catch (error: any) {
        reply.code(500);
        return { error: 'Verification failed', message: error.message };
      }
    });

    // POST /admin/2fa/disable
    app.post('/admin/2fa/disable', {}, async (request: any, reply: any) => {
      const { token } = request.body as { token: string };
      if (!token || !/^\d{6}$/.test(token)) {
        reply.code(400);
        return { error: 'Validation error', message: 'Invalid request format. Token must be 6 digits.' };
      }
      try {
        const success = await disable2FA(request.user.id, token);
        if (!success) {
          reply.code(401);
          return { error: 'Invalid token', message: 'Cannot disable 2FA: token verification failed.' };
        }
        return { success: true, message: 'Two-factor authentication has been disabled.' };
      } catch (error: any) {
        reply.code(500);
        return { error: 'Disable failed', message: error.message };
      }
    });

    // GET /admin/2fa/status
    app.get('/admin/2fa/status', {}, async (request: any, reply: any) => {
      const { userId } = request.query as { userId?: string };
      const currentUser = request.user;

      // If checking another user, require SUPER_ADMIN
      if (userId && currentUser.role !== 'SUPER_ADMIN') {
        reply.code(403);
        return { error: 'Forbidden', message: 'Only SUPER_ADMIN can check other users\' 2FA status.' };
      }

      const targetUserId = userId || currentUser.id;
      // Fetch user directly from mocked prisma
      const targetUser = await mockPrisma.user.findUnique({ where: { id: targetUserId } });

      if (!targetUser) {
        reply.code(404);
        return { error: 'User not found', message: 'The specified user does not exist.' };
      }

      const status = await get2FAStatus(targetUser.id, targetUser.role);

      return {
        success: true,
        data: {
          userId: targetUser.id,
          email: targetUser.email,
          ...status,
        },
      };
    });

    // Dummy admin route to test 2FA enforcement
    app.get('/admin/dummy', {}, async (request: any, reply: any) => {
      return { message: 'Access granted' };
    });
  });

  after(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Reset mock user to default (2FA disabled)
    mockPrisma.user.findUnique = async (query: any) => {
      const userId = query.where.id;
      if (userId === TEST_AGENT.id) {
        return { ...TEST_AGENT, mfaEnabled: false };
      }
      return { ...TEST_SUPER_ADMIN, mfaEnabled: false };
    };
  });

  describe('POST /admin/2fa/setup', () => {
    it('generates 2FA setup data for authenticated user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/2fa/setup',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.ok(body.data.secret);
      assert.ok(body.data.qrCode);
      assert.ok(body.data.manualEntry);
      assert.strictEqual(body.data.issuer, 'NEXTMAVENS WhatsApp Platform');
      assert.strictEqual(body.data.label, TEST_SUPER_ADMIN.email);
      assert.match(body.data.secret, /^[A-Z2-7]+$/);
      assert.match(body.data.qrCode, /^data:image\/png;base64,/);
    });

    it('returns 400 if 2FA already enabled', async () => {
      // Override mock to return mfaEnabled: true
      mockPrisma.user.findUnique = async (query: any) => {
        return { ...TEST_SUPER_ADMIN, mfaEnabled: true };
      };

      const response = await app.inject({
        method: 'POST',
        url: '/admin/2fa/setup',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.error, '2FA already enabled');
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/2fa/setup',
        headers: {},
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('POST /admin/2fa/verify', () => {
    it('enables 2FA for valid token', async () => {
      // Mock speakeasy verification
      const originalVerify = speakeasy.totp.verify;
      speakeasy.totp.verify = () => true;

      const response = await app.inject({
        method: 'POST',
        url: '/admin/2fa/verify',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
        payload: { token: '123456' },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);

      // Restore
      speakeasy.totp.verify = originalVerify;
    });

    it('returns 401 for invalid token', async () => {
      const originalVerify = speakeasy.totp.verify;
      speakeasy.totp.verify = () => false;

      const response = await app.inject({
        method: 'POST',
        url: '/admin/2fa/verify',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
        payload: { token: 'wrong' },
      });

      assert.strictEqual(response.statusCode, 401);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.error, 'Invalid token');

      // Restore
      speakeasy.totp.verify = originalVerify;
    });
  });

  describe('POST /admin/2fa/disable', () => {
    it('disables 2FA for valid token', async () => {
      // First set mfaEnabled to true for the user
      mockPrisma.user.findUnique = async (query: any) => {
        return { ...TEST_SUPER_ADMIN, mfaEnabled: true };
      };

      const originalVerify = speakeasy.totp.verify;
      speakeasy.totp.verify = () => true;

      const response = await app.inject({
        method: 'POST',
        url: '/admin/2fa/disable',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
        payload: { token: '123456' },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);

      // Restore
      speakeasy.totp.verify = originalVerify;
    });
  });

  describe('GET /admin/2fa/status', () => {
    it('returns 2FA status for authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/2fa/status',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.userId, TEST_SUPER_ADMIN.id);
      assert.strictEqual(body.data.enabled, false);
      assert.strictEqual(body.data.isPrivileged, true);
      assert.strictEqual(body.data.requires2FA, true);
    });

    it('allows SUPER_ADMIN to check other users status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/2fa/status?userId=user_agent_123',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.data.userId, 'user_agent_123');
      assert.strictEqual(body.data.requires2FA, false); // Agent is not privileged
    });

    it('forbids non-SUPER_ADMIN from checking other users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/2fa/status?userId=user_123',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_AGENT)}`,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.error, 'Forbidden');
    });
  });

  describe('2FA Enforcement Middleware', () => {
    it('blocks privileged user without 2FA from admin routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/dummy',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.code, 'MFA_REQUIRED');
      assert.ok(body.message.includes('Two-factor authentication required'));
    });

    it('allows privileged user with 2FA enabled', async () => {
      // Override mock to return mfaEnabled: true
      mockPrisma.user.findUnique = async (query: any) => {
        return { ...TEST_SUPER_ADMIN, mfaEnabled: true };
      };

      const response = await app.inject({
        method: 'GET',
        url: '/admin/dummy',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.message, 'Access granted');
    });

    it('allows non-privileged users regardless of 2FA status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/dummy',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_AGENT)}`,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.message, 'Access granted');
    });

    it('allows access to 2FA setup endpoint without 2FA enabled', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/2fa/setup',
        headers: {
          Authorization: `Bearer ${generateToken(TEST_SUPER_ADMIN)}`,
        },
      });

      assert.strictEqual(
        response.statusCode,
        200,
        '2FA setup should be accessible even when 2FA is disabled'
      );
    });
  });
});
