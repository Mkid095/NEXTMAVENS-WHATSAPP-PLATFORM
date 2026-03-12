/**
 * Queue Admin API Unit Tests
 *
 * Tests that the admin queue routes are registered correctly.
 * These tests focus on registration and do not test handler logic,
 * which is covered by the queue library tests (message-queue-priority-system.*.test.ts).
 */

/// <reference types="jest" />

import { registerQueueAdminRoutes } from '../app/api/implement-message-queue-priority-system/route.js';

// Mock the entire queue library to prevent Redis connection attempts during module load
jest.mock('../lib/message-queue-priority-system', () => ({
  getQueueMetrics: async () => ({
    name: 'whatsapp-messages',
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    priorityRanges: {}
  }),
  pauseQueue: async () => {},
  resumeQueue: async () => {},
  cleanOldJobs: async () => 0,
  validateRedisConnection: async () => true,
  getWorkerStatus: () => ({ isRunning: true, concurrency: 10 }),
  messageQueue: {
    add: async () => ({ id: 'job-123' }),
    getWaitingCount: async () => 0,
    getActiveCount: async () => 0,
    getCompletedCount: async () => 0,
    getFailedCount: async () => 0,
    getDelayedCount: async () => 0,
    getJobs: async () => [],
    clean: async () => 0,
    pause: async () => {},
    resume: async () => {},
    close: async () => {}
  },
  queueScheduler: { close: async () => {} },
  QUEUE_NAME: 'whatsapp-messages',
  startWorker: async () => ({}),
  stopWorker: async () => {}
}));

describe('Queue Admin API Route Registration', () => {
  beforeEach(() => {
    // Clear all jest mock calls/fakes
    jest.clearAllMocks();
  });

  it('should register all expected GET and POST routes', () => {
    // Create a mock Fastify instance with jest.fn() spies
    const fastify = {
      get: jest.fn().mockReturnThis(),
      post: jest.fn().mockReturnThis()
    };

    // Call the registration function
    registerQueueAdminRoutes(fastify);

    // Collect route paths
    const getPaths = (fastify.get as jest.Mock).mock.calls.map((args: string[]) => args[0]);
    const postPaths = (fastify.post as jest.Mock).mock.calls.map((args: string[]) => args[0]);

    // Verify expected GET routes
    expect(getPaths).toContain('/admin/queues/metrics');
    expect(getPaths).toContain('/admin/queues/health');

    // Verify expected POST routes
    expect(postPaths).toContain('/admin/queues/pause');
    expect(postPaths).toContain('/admin/queues/resume');
    expect(postPaths).toContain('/admin/queues/clean');

    // Verify correct number of routes
    expect(getPaths).toHaveLength(2);
    expect(postPaths).toHaveLength(3);
  });

  it('should register handlers as functions', () => {
    const fastify = {
      get: jest.fn().mockReturnThis(),
      post: jest.fn().mockReturnThis()
    };

    registerQueueAdminRoutes(fastify);

    // For each registered route, the third argument should be a function (handler)
    const getCalls = (fastify.get as jest.Mock).mock.calls;
    const postCalls = (fastify.post as jest.Mock).mock.calls;

    getCalls.forEach((args: any[]) => {
      expect(typeof args[2]).toBe('function');
    });
    postCalls.forEach((args: any[]) => {
      expect(typeof args[2]).toBe('function');
    });
  });

  it('should include body schema validation for clean endpoint', () => {
    const fastify = {
      get: jest.fn().mockReturnThis(),
      post: jest.fn().mockReturnThis()
    };

    registerQueueAdminRoutes(fastify);

    const postCalls = (fastify.post as jest.Mock).mock.calls;
    // Find the clean endpoint call
    const cleanCall = postCalls.find((args: any[]) => args[0] === '/admin/queues/clean');
    expect(cleanCall).toBeTruthy();

    const [, options] = cleanCall;
    expect(options?.schema?.body).toBeDefined();
    expect(options?.schema?.hide).toBe(true);
  });
});
