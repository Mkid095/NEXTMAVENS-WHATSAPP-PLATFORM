/**
 * Integration Tests - Message Status Tracking System
 * Tests end-to-end status updates, history recording, admin API, and WebSocket events
 */

/// <reference types="jest" />

import { FastifyInstance } from 'fastify';
import { TestAgent } from '@fastify/jest';
import { prisma } from '../src/lib/prisma';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

let app: FastifyInstance;
let testAgent: TestAgent;
let redis: Redis;

// Test data
const testOrgId = 'org_test_123';
const testInstanceId = 'inst_test_123';
const testChatId = 'chat_test_123';
const testMessageId = uuidv4();

// Helper functions
async function createTestMessage(status: string = 'PENDING') {
  return prisma.whatsAppMessage.create({
    data: {
      id: testMessageId,
      orgId: testOrgId,
      instanceId: testInstanceId,
      chatId: testChatId,
      messageId: `ext_${testMessageId}`,
      from: '1234567890@c.us',
      to: '0987654321@c.us',
      type: 'text',
      content: { body: 'Test message' },
      status: status as any,
      sentAt: new Date()
    }
  });
}

async function cleanup() {
  await prisma.messageStatusHistory.deleteMany({
    where: { messageId: testMessageId }
  });
  await prisma.whatsAppMessage.deleteMany({
    where: { id: testMessageId }
  });
}

// ============================================================================
// Fixtures
// ============================================================================

beforeAll(async () => {
  // Import app and initialize test agent
  const appModule = await import('../src/server');
  app = (appModule as any).default; // Assuming default export
  testAgent = app.inject({
    method: 'GET',
    url: '/'
  }) as any;
}, 30000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanup();
  await createTestMessage('PENDING');
});

// ============================================================================
// Admin API Tests
// ============================================================================

describe('Message Status Admin API', () => {
  const adminToken = 'test-admin-token'; // Would be validated by auth middleware

  test('GET /admin/messages/:messageId/history should return status history', async () => {
    // Create a few history entries
    await prisma.messageStatusHistory.createMany({
      data: [
        {
          messageId: testMessageId,
          status: 'PENDING',
          changedAt: new Date('2025-01-01T10:00:00Z'),
          changedBy: null,
          reason: 'creation'
        },
        {
          messageId: testMessageId,
          status: 'SENT',
          changedAt: new Date('2025-01-01T10:01:00Z'),
          changedBy: 'system',
          reason: 'queue'
        }
      ]
    });

    const response = await testAgent.get(`/admin/messages/${testMessageId}/history`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.entries).toHaveLength(2);
    expect(json.entries[0].status).toBe('PENDING');
  });

  test('POST /admin/messages/:messageId/status should update status and create history', async () => {
    const response = await testAgent.post(`/admin/messages/${testMessageId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'DELIVERED',
        reason: 'admin',
        metadata: { note: 'Manual update' }
      });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.success).toBe(true);
    expect(json.newStatus).toBe('DELIVERED');

    // Verify history entry created
    const history = await prisma.messageStatusHistory.findMany({
      where: { messageId: testMessageId },
      orderBy: { changedAt: 'desc' }
    });
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('DELIVERED');
    expect(history[0].reason).toBe('admin');
  });

  test('GET /admin/status-metrics should return distribution and transitions', async () => {
    // Create multiple messages with different statuses
    await prisma.whatsAppMessage.createMany({
      data: [
        { id: 'msg1', orgId: testOrgId, instanceId: testInstanceId, chatId: testChatId, messageId: 'ext1', from: '1', to: '2', type: 'text', content: {}, status: 'PENDING', sentAt: new Date() },
        { id: 'msg2', orgId: testOrgId, instanceId: testInstanceId, chatId: testChatId, messageId: 'ext2', from: '1', to: '2', type: 'text', content: {}, status: 'SENT', sentAt: new Date() },
        { id: 'msg3', orgId: testOrgId, instanceId: testInstanceId, chatId: testChatId, messageId: 'ext3', from: '1', to: '2', type: 'text', content: {}, status: 'DELIVERED', sentAt: new Date() }
      ]
    });

    const response = await testAgent.get('/admin/status-metrics')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.totalMessages).toBe(4); // Including testMessage from beforeEach
    expect(json.distribution.PENDING).toBeGreaterThan(0);
    expect(json.transitions).toBeDefined();
    expect(json.byReason).toBeDefined();
  });

  test('GET /admin/status-health should return current counts', async () => {
    const response = await testAgent.get('/admin/status-health')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.statusCounts).toBeDefined();
    expect(json.total).toBeGreaterThan(0);
  });
});

// ============================================================================
// Status Update Integration Tests
// ============================================================================

describe('Status Update Flow', () => {
  test('updateMessageStatus should create history entry with correct metadata', async () => {
    const { updateMessageStatus } = await import('../src/lib/message-status-tracking/status-manager');

    const result = await updateMessageStatus(testMessageId, testOrgId, {
      status: 'DELIVERED',
      reason: 'webhook',
      changedBy: 'system',
      metadata: { timestamp: new Date(), source: 'evolution' }
    });

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('DELIVERED');

    const history = await prisma.messageStatusHistory.findFirst({
      where: { messageId: testMessageId },
      orderBy: { changedAt: 'desc' }
    });
    expect(history).not.toBeNull();
    expect(history!.status).toBe('DELIVERED');
    expect(history!.reason).toBe('webhook');
    expect(history!.metadata).toMatchObject({
      source: 'evolution',
      previousStatus: 'PENDING'
    });
  });

  test('createStatusHistoryEntry should insert entry without touching message', async () => {
    const { createStatusHistoryEntry } = await import('../src/lib/message-status-tracking/status-manager');

    await createStatusHistoryEntry(
      testMessageId,
      testOrgId,
      'READ',
      'queue',
      'system',
      { jobId: 'job_123' }
    );

    const history = await prisma.messageStatusHistory.findFirst({
      where: { messageId: testMessageId }
    });
    expect(history).not.toBeNull();
    expect(history!.status).toBe('READ');
    expect(history!.reason).toBe('queue');

    // Ensure message status unchanged
    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: testMessageId }
    });
    expect(message.status).toBe('PENDING'); // still original
  });
});

// ============================================================================
// Queue Processor Integration Tests
// ============================================================================

describe('Queue Processor Status Tracking', () => {
  test('processMessageUpsert should record status history', async () => {
    // This would require mocking BullMQ Job and invoking the processor directly
    const { processMessageUpsert } = await import('../src/lib/message-queue-priority-system/consumer');

    const mockJob = {
      id: 'job_upsert_123',
      name: 'MESSAGE_UPSERT',
      data: {
        messageId: `upsert_${uuidv4()}`,
        chatId: testChatId,
        instanceId: testInstanceId,
        orgId: testOrgId,
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        type: 'text',
        content: { body: 'Hello' },
        status: 'SENDING'
      }
    };

    await processMessageUpsert(mockJob);

    // Check history entry created
    const history = await prisma.messageStatusHistory.findFirst({
      where: { messageId: mockJob.data.messageId }
    });
    expect(history).not.toBeNull();
    expect(history!.status).toBe('SENDING');
    expect(history!.reason).toBe('queue');
    expect(history!.metadata).toMatchObject({ jobId: mockJob.id });
  });

  test('processMessageStatusUpdate should record status history', async () => {
    const { processMessageStatusUpdate } = await import('../src/lib/message-queue-priority-system/consumer');

    // Create a message first
    await createTestMessage('PENDING');

    const mockJob = {
      id: 'job_status_123',
      name: 'MESSAGE_STATUS_UPDATE',
      data: {
        messageId: testMessageId,
        status: 'DELIVERED',
        instanceId: testInstanceId,
        chatId: testChatId,
        orgId: testOrgId
      }
    };

    await processMessageStatusUpdate(mockJob);

    const history = await prisma.messageStatusHistory.findFirst({
      where: { messageId: testMessageId }
    });
    expect(history).not.toBeNull();
    expect(history!.status).toBe('DELIVERED');
    expect(history!.reason).toBe('queue');
  });
});

// ============================================================================
// Webhook Handler Integration Tests
// ============================================================================

describe('Webhook Handler Status Tracking', () => {
  test('handleMessageUpdate should use status manager', async () => {
    const { handleMessageUpdate } = await import('../src/lib/integrate-evolution-api-message-status-webhooks/handlers');
    const { recordStatusChangeFromReceipt } = await import('../src/lib/message-status-tracking/status-manager');

    // Mock the status manager function
    const mockRecord = jest.fn().mockResolvedValue({
      success: true,
      messageId: testMessageId,
      oldStatus: 'SENT',
      newStatus: 'DELIVERED',
      historyEntryId: 'hist_123',
      timestamp: new Date(),
      instanceId: testInstanceId,
      chatId: testChatId,
      orgId: testOrgId
    });
    (recordStatusChangeFromReceipt as any) = mockRecord;

    const event = {
      event: 'MESSAGES_UPDATE',
      instanceId: testInstanceId,
      messageId: testMessageId,
      status: 'DELIVERED'
    };
    const orgId = testOrgId;

    const result = await handleMessageUpdate(event, orgId);

    expect(result.success).toBe(true);
    expect(mockRecord).toHaveBeenCalledWith(
      testMessageId,
      orgId,
      'DELIVERED',
      undefined
    );
  });
});

// ============================================================================
// Metrics Tests
// ============================================================================

describe('Status Metrics', () => {
  test('getStatusMetrics should compute transitions from history', async () => {
    const { getStatusMetrics } = await import('../src/lib/message-status-tracking/status-manager');

    // Insert history records with transitions
    const baseTime = new Date();
    await prisma.messageStatusHistory.createMany({
      data: [
        {
          messageId: 'trans_msg1',
          status: 'PENDING',
          changedAt: new Date(baseTime.getTime() - 60000),
          changedBy: null,
          reason: 'creation'
        },
        {
          messageId: 'trans_msg1',
          status: 'SENDING',
          changedAt: new Date(baseTime.getTime() - 50000),
          changedBy: null,
          reason: 'queue'
        },
        {
          messageId: 'trans_msg1',
          status: 'SENT',
          changedAt: new Date(baseTime.getTime() - 40000),
          changedBy: null,
          reason: 'queue'
        },
        {
          messageId: 'trans_msg2',
          status: 'PENDING',
          changedAt: new Date(baseTime.getTime() - 30000),
          changedBy: null,
          reason: 'creation'
        },
        {
          messageId: 'trans_msg2',
          status: 'FAILED',
          changedAt: new Date(baseTime.getTime() - 20000),
          changedBy: null,
          reason: 'queue'
        }
      ]
    });

    const metrics = await getStatusMetrics();

    expect(metrics.transitions['PENDING->SENDING']).toBe(1);
    expect(metrics.transitions['SENDING->SENT']).toBe(1);
    expect(metrics.transitions['PENDING->FAILED']).toBe(1);
  });
});

// ============================================================================
// WebSocket Integration Tests
// ============================================================================

describe('WebSocket Event Emission', () => {
  test('status updates should emit socket events when socket service is set', async () => {
    const { setSocketService, updateMessageStatus } = await import('../src/lib/message-status-tracking/status-manager');

    const mockSocketService = {
      broadcastToOrg: jest.fn(),
      broadcastToInstance: jest.fn()
    };
    setSocketService(mockSocketService);

    // Setup message fetch mock
    mockPrisma.whatsAppMessage.findFirst.mockResolvedValue({
      id: testMessageId,
      status: 'PENDING',
      orgId: testOrgId,
      instanceId: testInstanceId,
      chatId: testChatId
    });
    mockPrisma.whatsAppMessage.update.mockResolvedValue({
      id: testMessageId,
      status: 'SENT',
      updatedAt: new Date()
    });
    mockPrisma.messageStatusHistory.create.mockResolvedValue({
      id: 'hist_ws',
      changedAt: new Date()
    });

    await updateMessageStatus(testMessageId, testOrgId, {
      status: 'SENT',
      reason: 'admin'
    });

    expect(mockSocketService.broadcastToOrg).toHaveBeenCalledWith(
      testOrgId,
      'message:status:changed',
      expect.objectContaining({
        messageId: testMessageId,
        newStatus: 'SENT',
        reason: 'admin'
      })
    );

    // Also broadcast to instance
    expect(mockSocketService.broadcastToInstance).toHaveBeenCalledWith(
      testOrgId,
      testInstanceId,
      expect.objectContaining({
        type: 'message:status:changed',
        data: expect.objectContaining({
          messageId: testMessageId,
          newStatus: 'SENT'
        })
      })
    );
  });

  test('should not emit socket events if socket service not set', async () => {
    const { setSocketService, updateMessageStatus } = await import('../src/lib/message-status-tracking/status-manager');

    // Explicitly set to null
    setSocketService(null);

    // Setup mocks
    mockPrisma.whatsAppMessage.findFirst.mockResolvedValue({
      id: testMessageId,
      status: 'PENDING',
      orgId: testOrgId,
      instanceId: testInstanceId,
      chatId: testChatId
    });
    mockPrisma.whatsAppMessage.update.mockResolvedValue({
      id: testMessageId,
      status: 'SENT',
      updatedAt: new Date()
    });
    mockPrisma.messageStatusHistory.create.mockResolvedValue({
      id: 'hist_123',
      changedAt: new Date()
    });

    // Should not throw even though socket service is null
    await expect(updateMessageStatus(testMessageId, testOrgId, {
      status: 'SENT'
    })).resolves.not.toThrow();
  });
});

console.log('✅ Message Status Tracking Integration Tests defined');
