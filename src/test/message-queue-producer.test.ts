/**
 * Producer Tests - Message Queue Priority System
 * Tests the producer functions that enqueue jobs
 */

import { jest } from '@jest/globals';
import {
  queueMessageUpsert,
  queueMessageStatusUpdate,
  queueMessageDelete,
  queueInstanceStatusUpdate,
  queueContactUpdate,
  queueAnalyticsEvent,
  queueCriticalAlert,
  queueDatabaseCleanup,
  queueCacheRefresh,
  getPriorityForMessageType
} from '../src/lib/message-queue-priority-system/producer';
import { MessageType, MessagePriority } from '../src/lib/message-queue-priority-system/types';

// Mock the queue add function
const mockAddJob = jest.fn().mockResolvedValue({
  id: 'job-' + Math.random().toString(36).substr(2, 9),
  opts: { priority: 10 }
});

jest.mock('../src/lib/message-queue-priority-system/index', () => ({
  addJob: mockAddJob,
  getPriorityForType: jest.requireActual('../src/lib/message-queue-priority-system/index').getPriorityForType,
  QUEUE_NAME: 'whatsapp-messages'
}));

describe('Message Queue Producer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('queueMessageUpsert', () => {
    test('enqueues message upsert with correct data', async () => {
      const result = await queueMessageUpsert({
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        type: 'text',
        content: { text: 'Hello World' },
        status: 'PENDING'
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.MESSAGE_UPSERT,
        expect.objectContaining({
          messageId: 'msg-123',
          chatId: 'chat-456',
          instanceId: 'inst-789',
          orgId: 'org-001',
          from: '1234567890@c.us',
          to: '0987654321@c.us',
          type: 'text',
          content: { text: 'Hello World' },
          status: 'PENDING'
        }),
        expect.objectContaining({})
      );
      expect(result).toBeDefined();
    });

    test('uses MEDIUM priority for message upsert', async () => {
      await queueMessageUpsert({
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        type: 'text'
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ priority: MessagePriority.MEDIUM })
      );
    });
  });

  describe('queueMessageStatusUpdate', () => {
    test('enqueues status update with correct data', async () => {
      await queueMessageStatusUpdate({
        messageId: 'msg-123',
        status: 'delivered',
        instanceId: 'inst-789',
        chatId: 'chat-456',
        orgId: 'org-001'
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.MESSAGE_STATUS_UPDATE,
        expect.objectContaining({
          messageId: 'msg-123',
          status: 'delivered',
          instanceId: 'inst-789',
          chatId: 'chat-456',
          orgId: 'org-001'
        }),
        expect.objectContaining({ priority: MessagePriority.HIGH })
      );
    });

    test('rejects invalid status values', async () => {
      await expect(
        queueMessageStatusUpdate({
          messageId: 'msg-123',
          status: 'invalid' as any,
          instanceId: 'inst-789',
          chatId: 'chat-456',
          orgId: 'org-001'
        })
      ).rejects.toThrow();
    });

    test('accepts all valid status values', async () => {
      const statuses: Array<'sent' | 'delivered' | 'read' | 'failed'> = ['sent', 'delivered', 'read', 'failed'];

      for (const status of statuses) {
        await queueMessageStatusUpdate({
          messageId: 'msg-123',
          status,
          instanceId: 'inst-789',
          chatId: 'chat-456',
          orgId: 'org-001'
        });
        expect(mockAddJob).toHaveBeenLastCalledWith(
          MessageType.MESSAGE_STATUS_UPDATE,
          expect.objectContaining({ status }),
          expect.anything()
        );
      }
    });
  });

  describe('queueMessageDelete', () => {
    test('enqueues message deletion', async () => {
      await queueMessageDelete({
        messageId: 'msg-123',
        instanceId: 'inst-789',
        orgId: 'org-001',
        chatId: 'chat-456'
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.MESSAGE_DELETE,
        expect.objectContaining({
          messageId: 'msg-123',
          instanceId: 'inst-789',
          orgId: 'org-001',
          chatId: 'chat-456'
        }),
        expect.objectContaining({ priority: MessagePriority.MEDIUM })
      );
    });
  });

  describe('queueInstanceStatusUpdate', () => {
    test('enqueues instance status update with HIGH priority', async () => {
      await queueInstanceStatusUpdate({
        instanceId: 'inst-789',
        status: 'connected',
        orgId: 'org-001'
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.INSTANCE_STATUS_UPDATE,
        expect.objectContaining({
          instanceId: 'inst-789',
          status: 'connected',
          orgId: 'org-001'
        }),
        expect.objectContaining({ priority: MessagePriority.HIGH })
      );
    });

    test('accepts all valid instance statuses', async () => {
      const statuses: Array<'connecting' | 'connected' | 'disconnected' | 'error'> = [
        'connecting', 'connected', 'disconnected', 'error'
      ];

      for (const status of statuses) {
        await queueInstanceStatusUpdate({
          instanceId: 'inst-789',
          status,
          orgId: 'org-001'
        });
        expect(mockAddJob).toHaveBeenLastCalledWith(
          MessageType.INSTANCE_STATUS_UPDATE,
          expect.objectContaining({ status }),
          expect.anything()
        );
      }
    });
  });

  describe('queueContactUpdate', () => {
    test('enqueues contact update', async () => {
      await queueContactUpdate({
        contactId: 'contact-123',
        instanceId: 'inst-789',
        orgId: 'org-001',
        changes: { name: 'John Doe', phone: '1234567890' }
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.CONTACT_UPDATE,
        expect.objectContaining({
          contactId: 'contact-123',
          instanceId: 'inst-789',
          orgId: 'org-001',
          changes: { name: 'John Doe', phone: '1234567890' }
        }),
        expect.objectContaining({ priority: MessagePriority.MEDIUM })
      );
    });
  });

  describe('queueAnalyticsEvent', () => {
    test('enqueues analytics event with LOW priority', async () => {
      await queueAnalyticsEvent({
        eventName: 'user_action',
        properties: { action: 'click', element: 'button' },
        userId: 'user-123',
        orgId: 'org-001'
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.ANALYTICS_EVENT,
        expect.objectContaining({
          eventName: 'user_action',
          properties: { action: 'click', element: 'button' },
          userId: 'user-123',
          orgId: 'org-001'
        }),
        expect.objectContaining({ priority: MessagePriority.LOW })
      );
    });
  });

  describe('queueCriticalAlert', () => {
    test('enqueues critical alert with CRITICAL priority', async () => {
      await queueCriticalAlert({
        alertType: 'security_breach',
        message: 'Multiple failed login attempts',
        severity: 'high',
        metadata: { ip: '192.168.1.1', attempts: 10 }
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.ANALYTICS_EVENT, // alerts use ANALYTICS_EVENT type
        expect.objectContaining({
          eventName: 'critical_alert',
          properties: expect.objectContaining({
            alertType: 'security_breach',
            message: 'Multiple failed login attempts',
            severity: 'high',
            ip: '192.168.1.1',
            attempts: 10
          })
        }),
        expect.objectContaining({ priority: MessagePriority.CRITICAL })
      );
    });
  });

  describe('queueDatabaseCleanup', () => {
    test('enqueues DB cleanup with BACKGROUND priority', async () => {
      await queueDatabaseCleanup({
        olderThanDays: 30,
        tables: ['messages', 'analytics']
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.DATABASE_CLEANUP,
        expect.objectContaining({
          olderThanDays: 30,
          tables: ['messages', 'analytics']
        }),
        expect.objectContaining({ priority: MessagePriority.BACKGROUND })
      );
    });
  });

  describe('queueCacheRefresh', () => {
    test('enqueues cache refresh with BACKGROUND priority', async () => {
      await queueCacheRefresh({
        cacheKey: 'user:123:profile',
        refreshFunction: 'refreshUserProfile'
      });

      expect(mockAddJob).toHaveBeenCalledWith(
        MessageType.CACHE_REFRESH,
        expect.objectContaining({
          cacheKey: 'user:123:profile',
          refreshFunction: 'refreshUserProfile'
        }),
        expect.objectContaining({ priority: MessagePriority.BACKGROUND })
      );
    });
  });

  describe('getPriorityForMessageType', () => {
    test('returns correct priority for known types', () => {
      expect(getPriorityForMessageType(MessageType.MESSAGE_STATUS_UPDATE)).toBe(MessagePriority.HIGH);
      expect(getPriorityForMessageType(MessageType.MESSAGE_UPSERT)).toBe(MessagePriority.MEDIUM);
      expect(getPriorityForMessageType(MessageType.ANALYTICS_EVENT)).toBe(MessagePriority.LOW);
    });
  });
});
