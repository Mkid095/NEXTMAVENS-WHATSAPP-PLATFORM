/**
 * Integration Tests for Evolution API Webhooks
 *
 * Tests the full webhook pipeline: signature verification, parsing,
 * instance lookup, RLS context, database updates, and audit logging.
 *
 * Run: npx tsx src/test/webhook-evolution.integration.test.ts
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Test data
const TEST_ORG_ID = 'org_webhook_11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'user_webhook_11111111-1111-1111-1111-111111111111';
const TEST_INSTANCE_ID = 'instance_webhook_11111111-1111-1111-1111-111111111111';
const WEBHOOK_SECRET = 'test-webhook-secret-key-12345';

// Helper to create HMAC signature
function createSignature(body: Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Helper to simulate Evolution webhook payload
function createMockWebhookPayload(
  event: string,
  instanceId: string,
  data: Record<string, unknown> = {}
): { rawBody: Buffer; jsonBody: any } {
  const payload = {
    event,
    instanceId,
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    data,
    timestamp: new Date().toISOString(),
  };
  const jsonString = JSON.stringify(payload);
  return {
    rawBody: Buffer.from(jsonString),
    jsonBody: payload,
  };
}

describe('Evolution API Webhook Integration Tests', () => {
  before(async () => {
    console.log('\n🧪 Starting Evolution Webhook Integration Tests...');
    // Ensure clean state
    await cleanup();
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset session variables
    await prisma.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;
    await prisma.$executeRaw`SELECT set_config('app.current_user_role', NULL, false)`;
  });

  it('should initialize webhook processor with secret', async () => {
    const { initializeWebhookProcessor, healthCheck } = await import(
      '../lib/integrate-evolution-api-message-status-webhooks'
    );

    // Should throw if no secret
    let error: Error | null = null;
    try {
      initializeWebhookProcessor({ webhookSecret: '' });
    } catch (e) {
      error = e as Error;
    }
    assert(error !== null, 'Should throw on missing secret');

    // Initialize with secret
    initializeWebhookProcessor({ webhookSecret: WEBHOOK_SECRET });
    assert(healthCheck() === true, 'Health check should pass');
  });

  it('should verify webhook signature correctly', async () => {
    const { verifyWebhookSignature } = await import(
      '../lib/integrate-evolution-api-message-status-webhooks/signature.ts'
    );

    const body = Buffer.from('{"test":"data"}');
    const signature = createSignature(body, WEBHOOK_SECRET);

    assert(verifyWebhookSignature(body, signature, WEBHOOK_SECRET) === true);
    assert(verifyWebhookSignature(body, 'invalid', WEBHOOK_SECRET) === false);
    assert(verifyWebhookSignature(body, undefined, WEBHOOK_SECRET) === false);
  });

  it('should parse MESSAGES_UPSERT correctly', async () => {
    const { parseWebhookPayload } = await import(
      '../lib/integrate-evolution-api-message-status-webhooks/parsers.ts'
    );

    const payload = {
      event: 'MESSAGES_UPSERT',
      instanceId: TEST_INSTANCE_ID,
      data: {
        id: 'msg_123',
        from: '+15551234567',
        to: '+15559876543',
        type: 'text',
        body: 'Hello world',
        key: {
          remoteJid: '+15559876543@c.us',
          fromMe: false,
          id: 'msg_123',
        },
      },
    };

    const parsed = parseWebhookPayload(payload);
    assert.strictEqual(parsed.event, 'MESSAGES_UPSERT');
    assert.strictEqual(parsed.messageId, 'msg_123');
    assert.strictEqual(parsed.chatId, '+15559876543@c.us');
    assert.strictEqual(parsed.status, 'PENDING');
    assert.deepStrictEqual(parsed.content, {
      type: 'text',
      body: 'Hello world',
      key: payload.data.key,
    });
  });

  it('should parse MESSAGES_UPDATE correctly', async () => {
    const { parseWebhookPayload } = await import(
      '../lib/integrate-evolution-api-message-status-webhooks/parsers.ts'
    );

    const payload = {
      event: 'MESSAGES_UPDATE',
      instanceId: TEST_INSTANCE_ID,
      data: {
        id: 'msg_123',
        status: 'delivered',
      },
    };

    const parsed = parseWebhookPayload(payload);
    assert.strictEqual(parsed.event, 'MESSAGES_UPDATE');
    assert.strictEqual(parsed.messageId, 'msg_123');
    assert.strictEqual(parsed.status, 'DELIVERED');
  });

  it('should process MESSAGES_UPSERT and create message in database', async () => {
    // Setup: create org, instance, and chat in DB using SUPER_ADMIN
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;

      await tx.organization.create({
        data: { id: TEST_ORG_ID, name: 'Test Org', slug: 'test-org' },
      });

      await tx.user.create({
        data: {
          id: TEST_USER_ID,
          email: 'test@example.com',
          password: 'dummy',
          role: 'ORG_ADMIN',
        },
      });

      await tx.member.create({
        data: {
          id: 'member_1',
          userId: TEST_USER_ID,
          orgId: TEST_ORG_ID,
          role: 'ORG_ADMIN',
        },
      });

      await tx.whatsAppInstance.create({
        data: {
          id: TEST_INSTANCE_ID,
          orgId: TEST_ORG_ID,
          name: 'Test Instance',
          phoneNumber: '+15551234567',
          status: 'CONNECTED',
        },
      });

      // Create a chat for the instance
      await tx.whatsAppChat.create({
        data: {
          id: 'chat_123',
          orgId: TEST_ORG_ID,
          instanceId: TEST_INSTANCE_ID,
          chatId: '+15559876543@c.us',
          phone: '+15559876543',
        },
      });
    });

    // Now process webhook
    const { processEvolutionWebhook } = await import(
      '../lib/integrate-evolution-api-message-status-webhooks'
    );

    const { rawBody, jsonBody } = createMockWebhookPayload(
      'MESSAGES_UPSERT',
      TEST_INSTANCE_ID,
      {
        id: 'msg_integration_test',
        from: '+15551234567',
        to: '+15559876543',
        type: 'text',
        body: 'Integration test message',
      }
    );

    // Add signature to headers
    const signature = createSignature(rawBody, WEBHOOK_SECRET);
    const headers = { 'x-webhook-signature': signature };

    // Need to set EVOLUTION_WEBHOOK_SECRET for this test
    process.env.EVOLUTION_WEBHOOK_SECRET = WEBHOOK_SECRET;

    const result = await processEvolutionWebhook(rawBody, headers, jsonBody);

    assert.strictEqual(result.success, true, 'Webhook should process successfully');
    assert.strictEqual(result.orgId, TEST_ORG_ID, 'Org ID should match');

    // Verify message was created in database
    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: 'msg_integration_test' },
    });
    assert.ok(message, 'Message should exist in database');
    assert.strictEqual(message?.orgId, TEST_ORG_ID);
    assert.strictEqual(message?.status, 'PENDING');
    assert.strictEqual(message?.type, 'text');

    console.log('✅ Message created via webhook');
  });

  it('should handle idempotent MESSAGES_UPSERT (duplicate)', async () => {
    const { processEvolutionWebhook } = await import(
      '../lib/integrate-evolution-api-message-status-webhooks'
    );

    // Re-send the same webhook payload (duplicate)
    const { rawBody, jsonBody } = createMockWebhookPayload(
      'MESSAGES_UPSERT',
      TEST_INSTANCE_ID,
      {
        id: 'msg_integration_test',
        from: '+15551234567',
        to: '+15559876543',
        type: 'text',
        body: 'Integration test message',
      }
    );

    const signature = createSignature(rawBody, WEBHOOK_SECRET);
    const headers = { 'x-webhook-signature': signature };

    // This should not fail - should update instead
    const result = await processEvolutionWebhook(rawBody, headers, jsonBody);
    assert.strictEqual(result.success, true, 'Duplicate should succeed (idempotent)');
    assert.ok(result.message?.includes('updated'), 'Should indicate message was updated');

    console.log('✅ Idempotency works');
  });

  it('should process MESSAGES_UPDATE and update status', async () => {
    const { processEvolutionWebhook } = await import(
      '../lib/integrate-evolution-api-message-status-webhooks'
    );

    const { rawBody, jsonBody } = createMockWebhookPayload(
      'MESSAGES_UPDATE',
      TEST_INSTANCE_ID,
      {
        id: 'msg_integration_test',
        status: 'delivered',
      }
    );

    const signature = createSignature(rawBody, WEBHOOK_SECRET);
    const headers = { 'x-webhook-signature': signature };

    const result = await processEvolutionWebhook(rawBody, headers, jsonBody);
    assert.strictEqual(result.success, true);

    // Set RLS to verify the update (RLS context may be lost after webhook processing)
    await prisma.$executeRaw`SELECT set_config('app.current_org', ${TEST_ORG_ID}, false)`;
    await prisma.$executeRaw`SELECT set_config('app.current_user_role', 'API_USER', false)`;

    // Verify status updated
    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: 'msg_integration_test' },
    });
    assert.ok(message, 'Message should exist');
    assert.strictEqual(message?.status, 'DELIVERED');

    console.log('✅ Status update works');
  });

  it('should enforce RLS during webhook processing', async () => {
    // Create a second org and instance
    const ORG2_ID = 'org_webhook_22222222-2222-2222-2222-222222222222';
    const INSTANCE2_ID = 'instance_webhook_22222222-2222-2222-2222-222222222222';

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;

      await tx.organization.create({
        data: { id: ORG2_ID, name: 'Org 2', slug: 'org-2' },
      });

      await tx.whatsAppInstance.create({
        data: {
          id: INSTANCE2_ID,
          orgId: ORG2_ID,
          name: 'Instance 2',
          phoneNumber: '+15550001111',
          status: 'CONNECTED',
        },
      });

      await tx.whatsAppChat.create({
        data: {
          id: 'chat_org2',
          orgId: ORG2_ID,
          instanceId: INSTANCE2_ID,
          chatId: '+15550001111@c.us',
          phone: '+15550001111',
        },
      });
    });

    // Try to access Org 2's data from a different context
    // This should fail because we've only set RLS to Org 1 via the webhook processor
    // The processor sets RLS based on the instance's org, so we're fine

    // Set RLS to Org 1 to verify we can see Org 1 messages
    await prisma.$executeRaw`SELECT set_config('app.current_org', ${TEST_ORG_ID}, false)`;
    await prisma.$executeRaw`SELECT set_config('app.current_user_role', 'API_USER', false)`;

    const org1Messages = await prisma.whatsAppMessage.findMany({
      where: {
        orgId: TEST_ORG_ID,
      },
    });
    assert.ok(org1Messages.length >= 1, 'Org 1 messages visible');

    // Now manually set RLS to Org 2 and verify we can't see Org 1 messages
    await prisma.$executeRaw`SELECT set_config('app.current_org', ${ORG2_ID}, false)`;
    await prisma.$executeRaw`SELECT set_config('app.current_user_role', 'API_USER', false)`;

    const org2Messages = await prisma.whatsAppMessage.findMany({
      where: {
        orgId: ORG2_ID,
      },
    });
    assert.ok(org2Messages.length === 0, 'Org 2 has no messages yet');

    const crossCheck = await prisma.whatsAppMessage.findFirst({
      where: {
        orgId: TEST_ORG_ID, // Trying to query Org 1 explicitly
      },
    });
    assert.strictEqual(crossCheck, null, 'RLS blocks Org 1 data when context is Org 2');

    console.log('✅ RLS isolation enforced');
  });
});

// Cleanup function
async function cleanup() {
  try {
    await prisma.$executeRaw`
      DO $$
      BEGIN
        TRUNCATE TABLE whatsapp_messages CASCADE;
        TRUNCATE TABLE whatsapp_chats CASCADE;
        TRUNCATE TABLE whatsapp_instances CASCADE;
        TRUNCATE TABLE members CASCADE;
        TRUNCATE TABLE users CASCADE;
        TRUNCATE TABLE organizations CASCADE;
      END
      $$;
    `;
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}
