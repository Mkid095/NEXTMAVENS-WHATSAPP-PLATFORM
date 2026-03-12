/**
 * Unit Tests - Build Webhook Dead Letter Queue (DLQ) System
 * Tests core library functions with mocked Prisma and message queue.
 */

/// <reference types="jest" />

// Mock dependencies BEFORE importing library under test
jest.mock('../lib/prisma', () => ({
  prisma: {
    deadLetterQueue: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../lib/message-queue-priority-system/index', () => ({
  addJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
  MessageType: { WEBHOOK_EVENT: 'WEBHOOK_EVENT' },
}));

// Now import library and mocked modules
import {
  captureDeadLetter,
  getDeadLetters,
  getDeadLetter,
  retryDeadLetter,
  deleteDeadLetter,
  cleanOldDeadLetters,
} from '../lib/build-webhook-dead-letter-queue-system';

import { prisma } from '../lib/prisma';

describe('Build Webhook Dead Letter Queue (DLQ) System - Unit Tests', () => {
  const mockedDeadLetterQueue = (prisma as any).deadLetterQueue;
  const mockedTransaction = (prisma as any).$transaction;
  const mockedAddJob = (require('../lib/message-queue-priority-system/index') as any).addJob as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedTransaction.mockImplementation(async (cb: any) => await cb(prisma));
  });

  describe('captureDeadLetter', () => {
    it('should create a dead letter entry', async () => {
      mockedDeadLetterQueue.create.mockResolvedValue({});

      await captureDeadLetter(
        'org-123',
        'instance-456',
        'message.sent',
        { from: '1234567890@c.us', to: '0987654321@c.us' },
        'Connection timeout',
        2,
        new Date('2026-03-10T10:00:00Z')
      );

      expect(mockedDeadLetterQueue.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-123',
          instanceId: 'instance-456',
          event: 'message.sent',
          payload: { from: '1234567890@c.us', to: '0987654321@c.us' },
          error: 'Connection timeout',
          retryCount: 2,
          lastAttempted: new Date('2026-03-10T10:00:00Z'),
        },
      });
    });
  });

  describe('getDeadLetters', () => {
    it('should return paginated list with defaults', async () => {
      const mockRows = [
        {
          id: 'dl-1',
          orgId: 'org-1',
          instanceId: 'inst-1',
          event: 'message.sent',
          payload: { test: 1 },
          error: 'Error 1',
          retryCount: 3,
          lastAttempted: null,
          createdAt: new Date('2026-03-12T01:00:00Z'),
        },
        {
          id: 'dl-2',
          orgId: 'org-1',
          instanceId: 'inst-1',
          event: 'message.delivered',
          payload: { test: 2 },
          error: 'Error 2',
          retryCount: 1,
          lastAttempted: new Date('2026-03-12T02:00:00Z'),
          createdAt: new Date('2026-03-12T02:00:00Z'),
        },
      ];

      mockedDeadLetterQueue.findMany.mockResolvedValue(mockRows);
      mockedDeadLetterQueue.count.mockResolvedValue(2);

      const result = await getDeadLetters({ orgId: 'org-1' }, 1, 50);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.hasMore).toBe(false);
    });

    it('should apply filters correctly', async () => {
      const dateFrom = new Date('2026-03-10T00:00:00Z');
      const dateTo = new Date('2026-03-11T00:00:00Z');

      mockedDeadLetterQueue.findMany.mockResolvedValue([]);
      mockedDeadLetterQueue.count.mockResolvedValue(0);

      await getDeadLetters({
        orgId: 'org-xyz',
        instanceId: 'inst-abc',
        event: 'message.failed',
        createdAfter: dateFrom,
        createdBefore: dateTo,
      }, 2, 25);

      expect(mockedDeadLetterQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-xyz',
            instanceId: 'inst-abc',
            event: 'message.failed',
            createdAt: {
              gte: dateFrom,
              lte: dateTo,
            },
          }),
          skip: 25,
          take: 25,
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should handle empty results', async () => {
      mockedDeadLetterQueue.findMany.mockResolvedValue([]);
      mockedDeadLetterQueue.count.mockResolvedValue(0);

      const result = await getDeadLetters();

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getDeadLetter', () => {
    it('should return dead letter by ID', async () => {
      const mockDL = {
        id: 'dl-abc',
        orgId: 'org-1',
        instanceId: 'inst-1',
        event: 'message.sent',
        payload: { msg: 'test' },
        error: 'timeout',
        retryCount: 2,
        lastAttempted: new Date(),
        createdAt: new Date(),
      };
      mockedDeadLetterQueue.findUnique.mockResolvedValue(mockDL);

      const result = await getDeadLetter('dl-abc');

      expect(result).toEqual({
        id: 'dl-abc',
        orgId: 'org-1',
        instanceId: 'inst-1',
        event: 'message.sent',
        payload: { msg: 'test' },
        error: 'timeout',
        retryCount: 2,
        lastAttempted: mockDL.lastAttempted,
        createdAt: mockDL.createdAt,
      });
    });

    it('should return null if not found', async () => {
      mockedDeadLetterQueue.findUnique.mockResolvedValue(null);

      const result = await getDeadLetter('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('retryDeadLetter', () => {
    it('should successfully re-queue and delete dead letter in transaction', async () => {
      const dl = {
        id: 'dl-123',
        orgId: 'org-xyz',
        instanceId: 'inst-789',
        event: 'message.sent',
        payload: { from: '123', to: '456' },
        error: 'Network error',
        retryCount: 3,
        lastAttempted: new Date(),
        createdAt: new Date(),
      };

      mockedDeadLetterQueue.findFirst.mockResolvedValue(dl);
      mockedAddJob.mockResolvedValue({ id: 'new-job-456' });

      const result = await retryDeadLetter('dl-123', 'org-xyz');

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('new-job-456');
      expect(mockedAddJob).toHaveBeenCalledWith(
        'WEBHOOK_EVENT',
        expect.objectContaining({
          webhookId: 'retry:dl-123',
          event: 'message.sent',
          payload: { from: '123', to: '456' },
          instanceId: 'inst-789',
          orgId: 'org-xyz',
          originalError: 'Network error',
          previousRetries: 3,
        })
      );
      expect(mockedDeadLetterQueue.delete).toHaveBeenCalledWith({
        where: { id: 'dl-123' },
      });
    });

    it('should fail if dead letter not found or org mismatch', async () => {
      mockedDeadLetterQueue.findFirst.mockResolvedValue(null);

      const result = await retryDeadLetter('dl-missing', 'org-wrong');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found or access denied');
      expect(mockedAddJob).not.toHaveBeenCalled();
    });

    it('should fail if re-queue fails', async () => {
      const dl = {
        id: 'dl-err',
        orgId: 'org-1',
        instanceId: 'inst-1',
        event: 'test',
        payload: {},
        error: 'old error',
        retryCount: 1,
        lastAttempted: new Date(),
        createdAt: new Date(),
      };

      mockedDeadLetterQueue.findFirst.mockResolvedValue(dl);
      mockedAddJob.mockRejectedValue(new Error('Queue down'));

      const result = await retryDeadLetter('dl-err', 'org-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Queue down');
      expect(mockedDeadLetterQueue.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteDeadLetter', () => {
    it('should delete if found and org matches', async () => {
      mockedDeadLetterQueue.deleteMany.mockResolvedValue({ count: 1 });

      const result = await deleteDeadLetter('dl-123', 'org-1');

      expect(result).toBe(true);
      expect(mockedDeadLetterQueue.deleteMany).toHaveBeenCalledWith({
        where: { id: 'dl-123', orgId: 'org-1' },
      });
    });

    it('should return false if not found or org mismatch', async () => {
      mockedDeadLetterQueue.deleteMany.mockResolvedValue({ count: 0 });

      const result = await deleteDeadLetter('dl-999', 'org-wrong');

      expect(result).toBe(false);
    });
  });

  describe('cleanOldDeadLetters', () => {
    it('should delete entries older than specified days', async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 3);
      mockedDeadLetterQueue.deleteMany.mockResolvedValue({ count: 15 });

      const result = await cleanOldDeadLetters(3);

      expect(result).toBe(15);
      expect(mockedDeadLetterQueue.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lte: cutoff },
        },
      });
    });

    it('should use default 7 days', async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      mockedDeadLetterQueue.deleteMany.mockResolvedValue({ count: 0 });

      await cleanOldDeadLetters();

      expect(mockedDeadLetterQueue.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lte: cutoff },
        },
      });
    });
  });
});