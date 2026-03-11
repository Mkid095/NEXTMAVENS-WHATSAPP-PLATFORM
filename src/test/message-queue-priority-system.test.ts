/**
 * Unit Tests - Message Queue Priority System
 * Tests the queue core, producer, and consumer modules
 */

import { jest } from '@jest/globals';
import {
  MessagePriority,
  MessageType,
  getPriorityForType,
  validateMessageStatusUpdate,
  validateInstanceStatusUpdate,
  validateContactUpdate,
  validateAnalyticsEvent,
  validateMessageUpsert,
  validateMessageDelete
} from '../src/lib/message-queue-priority-system/types';
import { MessageStatusUpdateJob, InstanceStatusUpdateJob } from '../src/lib/message-queue-priority-system/types';

// Mock BullMQ to avoid Redis dependency in unit tests
jest.mock('../src/lib/message-queue-priority-system/index', () => ({
  messageQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job-123', opts: { priority: 10 } }),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
    getJobs: jest.fn().mockResolvedValue([]),
    clean: jest.fn().mockResolvedValue(0),
    pause: jest.fn(),
    resume: jest.fn(),
    close: jest.fn()
  },
  queueScheduler: {
    close: jest.fn()
  },
  redisConnection: {
    quit: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG')
  },
  getPriorityForType: jest.requireActual('../src/lib/message-queue-priority-system/index').getPriorityForType,
  addJob: jest.fn().mockResolvedValue({ id: 'job-123', opts: { priority: 10 } }),
  addCriticalJob: jest.fn().mockResolvedValue({ id: 'job-123', opts: { priority: 1 } }),
  addBackgroundJob: jest.fn().mockResolvedValue({ id: 'job-123', opts: { priority: 100 } }),
  getQueueMetrics: jest.fn().mockResolvedValue({
    name: 'whatsapp-messages',
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    priorityRanges: {}
  }),
  cleanOldJobs: jest.fn().mockResolvedValue(0),
  shutdownQueue: jest.fn(),
  pauseQueue: jest.fn(),
  resumeQueue: jest.fn(),
  validateRedisConnection: jest.fn().mockResolvedValue(true),
  QUEUE_NAME: 'whatsapp-messages'
}));

jest.mock('../src/lib/message-queue-priority-system/consumer', () => ({
  startWorker: jest.fn().mockReturnValue({
    concurrency: 10,
    processedJobs: 0,
    failedJobs: 0,
    close: jest.fn()
  }),
  stopWorker: jest.fn(),
  getWorkerStatus: jest.fn().mockReturnValue({
    isRunning: true,
    concurrency: 10,
    processedJobs: 0,
    failedJobs: 0
  })
}));

describe('Message Queue Priority System - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Priority Mapping', () => {
    test('getPriorityForType returns correct priority for each message type', () => {
      expect(getPriorityForType(MessageType.MESSAGE_STATUS_UPDATE)).toBe(MessagePriority.HIGH);
      expect(getPriorityForType(MessageType.MESSAGE_UPSERT)).toBe(MessagePriority.MEDIUM);
      expect(getPriorityForType(MessageType.MESSAGE_DELETE)).toBe(MessagePriority.MEDIUM);
      expect(getPriorityForType(MessageType.INSTANCE_STATUS_UPDATE)).toBe(MessagePriority.HIGH);
      expect(getPriorityForType(MessageType.CONTACT_UPDATE)).toBe(MessagePriority.MEDIUM);
      expect(getPriorityForType(MessageType.ANALYTICS_EVENT)).toBe(MessagePriority.LOW);
      expect(getPriorityForType(MessageType.WEBHOOK_EVENT)).toBe(MessagePriority.LOW);
      expect(getPriorityForType(MessageType.DATABASE_CLEANUP)).toBe(MessagePriority.BACKGROUND);
    });
  });

  describe('Job Validation', () => {
    describe('validateMessageStatusUpdate', () => {
      test('validates correct message status update job', () => {
        const validJob: MessageStatusUpdateJob = {
          type: MessageType.MESSAGE_STATUS_UPDATE,
          payload: {
            messageId: 'msg-123',
            status: 'delivered',
            instanceId: 'inst-456',
            chatId: 'chat-789',
            orgId: 'org-001'
          }
        };
        expect(validateMessageStatusUpdate(validJob)).toBe(true);
      });

      test('rejects job with missing required fields', () => {
        const invalidJob = {
          type: MessageType.MESSAGE_STATUS_UPDATE,
          payload: {
            messageId: 'msg-123',
            // missing status, instanceId, chatId, orgId
          }
        };
        expect(validateMessageStatusUpdate(invalidJob)).toBe(false);
      });

      test('rejects job with wrong type', () => {
        const wrongTypeJob = {
          type: MessageType.ANALYTICS_EVENT,
          payload: { eventName: 'test', properties: {} }
        };
        expect(validateMessageStatusUpdate(wrongTypeJob)).toBe(false);
      });

      test('rejects invalid status value', () => {
        const invalidStatusJob: any = {
          type: MessageType.MESSAGE_STATUS_UPDATE,
          payload: {
            messageId: 'msg-123',
            status: 'invalid_status',
            instanceId: 'inst-456',
            chatId: 'chat-789',
            orgId: 'org-001'
          }
        };
        expect(validateMessageStatusUpdate(invalidStatusJob)).toBe(false);
      });
    });

    describe('validateInstanceStatusUpdate', () => {
      test('validates correct instance status update job', () => {
        const validJob: InstanceStatusUpdateJob = {
          type: MessageType.INSTANCE_STATUS_UPDATE,
          payload: {
            instanceId: 'inst-456',
            status: 'connected',
            orgId: 'org-001'
          }
        };
        expect(validateInstanceStatusUpdate(validJob)).toBe(true);
      });

      test('rejects invalid status value', () => {
        const invalidJob: any = {
          type: MessageType.INSTANCE_STATUS_UPDATE,
          payload: {
            instanceId: 'inst-456',
            status: 'invalid',
            orgId: 'org-001'
          }
        };
        expect(validateInstanceStatusUpdate(invalidJob)).toBe(false);
      });
    });

    describe('validateMessageUpsert', () => {
      test('validates correct message upsert job', () => {
        const validJob = {
          type: MessageType.MESSAGE_UPSERT,
          payload: {
            messageId: 'msg-123',
            chatId: 'chat-789',
            instanceId: 'inst-456',
            orgId: 'org-001',
            from: '1234567890@c.us',
            to: '0987654321@c.us',
            type: 'text',
            content: { text: 'Hello' },
            status: 'PENDING'
          }
        };
        expect(validateMessageUpsert(validJob)).toBe(true);
      });

      test('rejects missing messageId', () => {
        const invalidJob = {
          type: MessageType.MESSAGE_UPSERT,
          payload: {
            chatId: 'chat-789',
            instanceId: 'inst-456',
            orgId: 'org-001',
            type: 'text'
          }
        };
        expect(validateMessageUpsert(invalidJob)).toBe(false);
      });
    });

    describe('validateMessageDelete', () => {
      test('validates correct message delete job', () => {
        const validJob = {
          type: MessageType.MESSAGE_DELETE,
          payload: {
            messageId: 'msg-123',
            instanceId: 'inst-456',
            orgId: 'org-001'
          }
        };
        expect(validateMessageDelete(validJob)).toBe(true);
      });

      test('accepts optional chatId field', () => {
        const validJob = {
          type: MessageType.MESSAGE_DELETE,
          payload: {
            messageId: 'msg-123',
            instanceId: 'inst-456',
            orgId: 'org-001',
            chatId: 'chat-789'
          }
        };
        expect(validateMessageDelete(validJob)).toBe(true);
      });
    });
  });

  describe('Type Definitions', () => {
    test('MessagePriority enum exists with correct values', () => {
      expect(MessagePriority.CRITICAL).toBe(1);
      expect(MessagePriority.HIGH).toBe(5);
      expect(MessagePriority.MEDIUM).toBe(10);
      expect(MessagePriority.LOW).toBe(50);
      expect(MessagePriority.BACKGROUND).toBe(100);
    });

    test('MessageType enum includes all required types', () => {
      expect(MessageType.MESSAGE_UPSERT).toBe('message_upsert');
      expect(MessageType.MESSAGE_STATUS_UPDATE).toBe('message_status_update');
      expect(MessageType.MESSAGE_DELETE).toBe('message_delete');
      expect(MessageType.INSTANCE_STATUS_UPDATE).toBe('instance_status_update');
      expect(MessageType.CONTACT_UPDATE).toBe('contact_update');
      expect(MessageType.ANALYTICS_EVENT).toBe('analytics_event');
    });
  });

  describe('Worker Lifecycle', () => {
    const { startWorker, stopWorker, getWorkerStatus } = require('../src/lib/message-queue-priority-system/consumer');

    test('startWorker creates worker with correct concurrency', () => {
      const worker = startWorker();
      expect(worker.concurrency).toBe(10);
    });

    test('getWorkerStatus returns correct status when worker is running', () => {
      const status = getWorkerStatus();
      expect(status.isRunning).toBe(true);
      expect(status.concurrency).toBe(10);
    });

    test('stopWorker gracefully stops worker', async () => {
      await stopWorker();
      const status = getWorkerStatus();
      expect(status.isRunning).toBe(false);
    });
  });
});
