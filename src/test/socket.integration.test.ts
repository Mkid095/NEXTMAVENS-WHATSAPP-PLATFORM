/**
 * Socket.IO Integration Tests
 *
 * Tests real-time messaging flow: webhook → DB → Socket broadcast.
 * Covers:
 *   - JWT authentication
 *   - Instance room joining with org access control
 *   - Message upsert broadcasts
 *   - Message status update broadcasts
 *   - Multi-tenant isolation (different orgs don't receive each other's events)
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'assert';
import http from 'http';
import { PrismaClient } from '@prisma/client';
import { Server as SocketIOServer } from 'socket.io';
import { Client as SocketClient } from 'socket.io-client';
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Test utilities
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function createTestData() {
  const orgId = generateId();
  const userId = generateId();

  // Bypass RLS: set role to SUPER_ADMIN
  await prisma.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;

  const org = await prisma.organization.create({
    data: { id: orgId, name: 'Test Org', slug: `test-${orgId.slice(0,5)}` }
  });

  await prisma.user.create({
    data: {
      id: userId,
      email: `test-${userId}@example.com`,
      password: 'dummy',
      name: 'Test User',
      role: 'AGENT',
      isActive: true
    }
  });

  await prisma.member.create({
    data: {
      userId,
      orgId,
      role: 'ADMIN'
    }
  });

  const instanceId = generateId();
  await prisma.whatsAppInstance.create({
    data: {
      id: instanceId,
      orgId,
      name: 'Test Instance',
      phoneNumber: `+${generateId().slice(0,10)}`,
      status: 'CONNECTED'
    }
  });

  // Reset role to normal (will be set by tests as needed)
  await prisma.$executeRaw`SELECT set_config('app.current_user_role', NULL, false)`;

  return { orgId, userId, instanceId };
}

function generateToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

// ==========================================
// TESTS
// ==========================================

describe('Socket.IO Integration', () => {
  let httpServer: http.Server;
  let socketIo: SocketIOServer;
  let port: number;

  before(async () => {
    console.log('\n🔌 Starting Socket.IO test server...');

    // Create HTTP server
    httpServer = http.createServer();
    // Initialize Socket.IO with in-memory adapter (no Redis for tests)
    socketIo = new SocketIOServer(httpServer, {
      cors: { origin: '*', credentials: true }
      // No adapter = memory adapter
    });

    // Auth middleware (same as production)
    socketIo.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('unauthorized'));
        const payload = jwt.verify(token, JWT_SECRET) as any;
        if (!payload?.userId) throw new Error('invalid payload');

        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, isActive: true }
        });

        if (!user || !user.isActive) throw new Error('inactive');
        socket.data.userId = user.id;
        next();
      } catch (err) {
        next(err);
      }
    });

    socketIo.on('connection', (socket) => {
      socket.on('join:instance', async (instanceId) => {
        // Verify membership
        const instance = await prisma.whatsAppInstance.findUnique({
          where: { id: instanceId },
          select: { id: true, orgId: true }
        });
        if (!instance) {
          socket.emit('error', { message: 'Instance not found' });
          return;
        }
        const member = await prisma.member.findFirst({
          where: { userId: socket.data.userId, orgId: instance.orgId }
        });
        if (!member) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }
        socket.data.instanceId = instanceId;
        socket.data.orgId = instance.orgId;
        socket.join(`instance-${instanceId}`);
        socket.emit('instance:joined', { instanceId });
      });
    });

    // Listen on random port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address()?.port || 0;
        resolve();
      });
    });

    console.log(`✅ Test server listening on port ${port}`);
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      socketIo.disconnectSockets(true);
      socketIo.close();
      httpServer.close(resolve);
    });
    await prisma.$disconnect();
    console.log('🧹 Test cleanup complete');
  });

  beforeEach(async () => {
    // Clean DB
    await prisma.$executeRaw`TRUNCATE TABLE whatsapp_messages, whatsapp_chats, whatsapp_instances, members, organizations, "user" CASCADE`;
  });

  it('should connect with valid JWT', async () => {
    const { userId } = await createTestData();
    const token = generateToken(userId);

    const client = new SocketClient(`http://localhost:${port}`, {
      auth: { token }
    });

    const connectPromise = new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(new Error(err.message)));
    });

    await Promise.race([connectPromise, setTimeout(() => reject(new Error('timeout')), 5000)]);

    assert.ok(client.connected);
    client.disconnect();
  });

  it('should reject connection with invalid token', async () => {
    const client = new SocketClient(`http://localhost:${port}`, {
      auth: { token: 'invalid.token' }
    });

    const errorPromise = new Promise<void>((resolve, reject) => {
      client.on('connect_error', (err) => {
        reject(Object.assign(new Error(), { message: err.message }));
      });
    });

    let err;
    try {
      await Promise.race([errorPromise, setTimeout(() => { throw new Error('timeout'); }, 5000)]);
    } catch (e) {
      err = e;
    }

    assert.ok(err, 'Should have connection error');
    assert.strictEqual(err?.message, 'unauthorized');
  });

  it('should receive message upsert broadcast after joining instance', async () => {
    const { userId, instanceId } = await createTestData();
    const token = generateToken(userId);

    const client = new SocketClient(`http://localhost:${port}`, {
      auth: { token }
    });

    // Wait for connect
    await new Promise<void>((resolve) => client.on('connect', resolve));

    // Join instance room
    await new Promise<void>((resolve) => {
      client.emit('join:instance', instanceId);
      client.on('instance:joined', (data) => {
        assert.strictEqual(data.instanceId, instanceId);
        resolve();
      });
    });

    // Simulate webhook: call handler directly (bypass HTTP)
    const messageId = generateId();
    const chatId = generateId();

    // Create chat first
    await prisma.whatsAppChat.create({
      data: {
        id: chatId,
        orgId,
        instanceId,
        chatId,
        phone: '+1234567890'
      }
    });

    const event = {
      event: 'MESSAGES_UPSERT',
      instanceId,
      messageId,
      chatId,
      from: '+1234567890',
      to: '+0987654321',
      type: 'text',
      content: { body: 'Hello test' },
      status: 'PENDING'
    };

    // Manually invoke handler (with RLS context set appropriately for the org)
    await prisma.$executeRaw`SELECT set_config('app.current_org', ${orgId}, false)`;
    const { dispatchWebhookHandler } = await import('../lib/integrate-evolution-api-message-status-webhooks/handlers.ts');
    await dispatchWebhookHandler(event as any, orgId);

    // Wait for broadcast
    const received = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
      client.on('whatsapp:message:upsert', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    assert.strictEqual(received.messageId, messageId);
    assert.strictEqual(received.chatId, chatId);
    assert.strictEqual(received.status, 'PENDING');

    client.disconnect();
  });

  it('should not receive broadcasts from another org (RLS isolation)', async () => {
    // Org A
    const { userId: userIdA, orgId: orgA, instanceId: instanceA } = await createTestData();
    // Org B
    const { userId: userIdB, instanceId: instanceB } = await createTestData();

    const tokenA = generateToken(userIdA);
    const tokenB = generateToken(userIdB);

    const clientA = new SocketClient(`http://localhost:${port}`, { auth: { token: tokenA } });
    const clientB = new SocketClient(`http://localhost:${port}`, { auth: { token: tokenB } });

    await new Promise<void>((resolve) => clientA.on('connect', resolve));
    await new Promise<void>((resolve) => clientB.on('connect', resolve));

    // Both join their respective instances
    await Promise.all([
      new Promise<void>((resolve) => {
        clientA.emit('join:instance', instanceA);
        clientA.on('instance:joined', () => resolve());
      }),
      new Promise<void>((resolve) => {
        clientB.emit('join:instance', instanceB);
        clientB.on('instance:joined', () => resolve());
      })
    ]);

    // Org A sends a message
    const messageId = generateId();
    const chatId = generateId();
    await prisma.whatsAppChat.create({ data: { id: chatId, orgId: orgA, instanceId: instanceA, chatId, phone: '+11111111111' } });

    const event = {
      event: 'MESSAGES_UPSERT',
      instanceId: instanceA,
      messageId,
      chatId,
      from: '+11111111111',
      to: '+22222222222',
      type: 'text',
      content: { body: 'Secret A' },
      status: 'PENDING'
    };

    await prisma.$executeRaw`SELECT set_config('app.current_org', ${orgA}, false)`;
    const { dispatchWebhookHandler } = await import('../lib/integrate-evolution-api-message-status-webhooks/handlers.ts');
    await dispatchWebhookHandler(event as any, orgA);

    // Client A receives
    const msgA = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout A')), 5000);
      clientA.on('whatsapp:message:upsert', (data) => {
        if (data.messageId === messageId) {
          clearTimeout(timeout);
          resolve(data);
        }
      });
    });
    assert.strictEqual(msgA.messageId, messageId);

    // Client B does NOT receive (timeout)
    let timeoutB = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          timeoutB = true;
          reject(new Error('timeout B'));
        }, 3000);
        clientB.on('whatsapp:message:upsert', (data) => {
          if (data.messageId === messageId) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      assert.fail('Client B should not have received message');
    } catch (e) {
      assert.ok(timeoutB, 'Client B timed out waiting for message (expected)');
    }

    clientA.disconnect();
    clientB.disconnect();
  });

  it('should handle message status update broadcast', async () => {
    const { userId, orgId, instanceId } = await createTestData();
    const token = generateToken(userId);

    const client = new SocketClient(`http://localhost:${port}`, { auth: { token } });
    await new Promise<void>((resolve) => client.on('connect', resolve));

    await new Promise<void>((resolve) => {
      client.emit('join:instance', instanceId);
      client.on('instance:joined', () => resolve());
    });

    // Create a message first
    const messageId = generateId();
    const chatId = generateId();
    await prisma.whatsAppChat.create({ data: { id: chatId, orgId, instanceId, chatId, phone: '+1234567890' } });
    await prisma.whatsAppMessage.create({
      data: {
        id: messageId,
        orgId,
        instanceId,
        chatId,
        messageId,
        from: '+1234567890',
        to: '+0987654321',
        type: 'text',
        content: { body: 'Test' },
        status: 'PENDING'
      }
    });

    // Trigger status update
    const event = {
      event: 'MESSAGES_UPDATE',
      instanceId,
      messageId,
      status: 'DELIVERED'
    };

    await prisma.$executeRaw`SELECT set_config('app.current_org', ${orgId}, false)`;
    const { dispatchWebhookHandler } = await import('../lib/integrate-evolution-api-message-status-webhooks/handlers.ts');
    await dispatchWebhookHandler(event as any, orgId);

    // Wait for update
    const received = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout update')), 5000);
      client.on('whatsapp:message:update', (data) => {
        if (data.messageId === messageId && data.status === 'DELIVERED') {
          clearTimeout(timeout);
          resolve(data);
        }
      });
    });

    assert.strictEqual(received.status, 'DELIVERED');
    client.disconnect();
  });

});
