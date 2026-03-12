/**
 * DLQ Admin API Unit Tests
 *
 * Tests that the admin DLQ routes are registered correctly.
 * These tests focus on registration and do not test handler logic,
 * which is covered by the library tests (dead-letter-queue.unit.test.ts).
 */

/// <reference types="jest" />

import { registerDeadLetterQueueAdminRoutes } from '../app/api/build-webhook-dead-letter-queue-(dlq)-system/route.js';

// Mock the DLQ library to prevent database dependencies during module load
jest.mock('../lib/build-webhook-dead-letter-queue-system', () => ({
  getDeadLetters: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, hasMore: false }),
  getDeadLetter: jest.fn().mockResolvedValue(null),
  retryDeadLetter: jest.fn().mockResolvedValue({ success: true }),
  deleteDeadLetter: jest.fn().mockResolvedValue(true),
  cleanOldDeadLetters: jest.fn().mockResolvedValue(0),
}));

describe('DLQ Admin API Route Registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register all expected GET, POST, and DELETE routes', () => {
    const fastify = {
      get: jest.fn().mockReturnThis(),
      post: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    registerDeadLetterQueueAdminRoutes(fastify);

    const getPaths = (fastify.get as any).mock.calls.map((args: string[]) => args[0]);
    const postPaths = (fastify.post as any).mock.calls.map((args: string[]) => args[0]);
    const deletePaths = (fastify.delete as any).mock.calls.map((args: string[]) => args[0]);

    // GET routes
    expect(getPaths).toContain('/admin/dlq');
    expect(getPaths).toContain('/admin/dlq/:id');

    // POST routes
    expect(postPaths).toContain('/admin/dlq/:id/retry');
    expect(postPaths).toContain('/admin/dlq/clean');

    // DELETE routes
    expect(deletePaths).toContain('/admin/dlq/:id');

    // Counts
    expect(getPaths).toHaveLength(2);
    expect(postPaths).toHaveLength(2);
    expect(deletePaths).toHaveLength(1);
  });

  it('should register handlers as functions', () => {
    const fastify = {
      get: jest.fn().mockReturnThis(),
      post: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    registerDeadLetterQueueAdminRoutes(fastify);

    const getCalls = (fastify.get as any).mock.calls;
    const postCalls = (fastify.post as any).mock.calls;
    const deleteCalls = (fastify.delete as any).mock.calls;

    [...getCalls, ...postCalls, ...deleteCalls].forEach((args: any[]) => {
      expect(typeof args[2]).toBe('function');
    });
  });

  it('should include query schema for list endpoint and body schema for clean endpoint', () => {
    const fastify = {
      get: jest.fn().mockReturnThis(),
      post: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    registerDeadLetterQueueAdminRoutes(fastify);

    const getCalls = (fastify.get as any).mock.calls;
    const listCall = getCalls.find((args: any[]) => args[0] === '/admin/dlq');
    expect(listCall).toBeTruthy();
    const [, listOptions] = listCall;
    expect(listOptions?.schema?.query).toBeDefined();

    const postCalls = (fastify.post as any).mock.calls;
    const cleanCall = postCalls.find((args: any[]) => args[0] === '/admin/dlq/clean');
    expect(cleanCall).toBeTruthy();
    const [, cleanOptions] = cleanCall;
    expect(cleanOptions?.schema?.body).toBeDefined();
  });
});