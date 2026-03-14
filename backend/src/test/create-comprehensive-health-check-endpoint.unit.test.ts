/**
 * Unit Tests - Comprehensive Health Check Endpoint
 * Tests the health check library functions with mocked dependencies.
 */

import { performHealthCheck } from '../lib/create-comprehensive-health-check-endpoint';
import { prisma } from '../lib/prisma';
import { messageQueue } from '../lib/message-queue-priority-system';
import { createClient, RedisClientType } from 'redis';

// Mock dependencies
jest.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../lib/message-queue-priority-system', () => ({
  messageQueue: {
    getJobCounts: jest.fn(),
  },
}));

jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe('Comprehensive Health Check', () => {
  const mockedQueryRaw = prisma.$queryRaw as jest.Mock;
  const mockedGetJobCounts = messageQueue.getJobCounts as jest.Mock;
  const mockedCreateClient = createClient as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default successful mocks
    mockedQueryRaw.mockResolvedValue(1);
    mockedGetJobCounts.mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
    mockedCreateClient.mockReturnValue({
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('should return healthy when all systems are up', async () => {
    const result = await performHealthCheck();

    expect(result.status).toBe('healthy');
    expect(result.checks.database.status).toBe('healthy');
    expect(result.checks.redis.status).toBe('healthy');
    expect(result.checks.queue.status).toBe('healthy');
    expect(typeof result.uptime).toBe('number');
    expect(result.memory.rss).toBeGreaterThan(0);
  });

  it('should return degraded if Redis fails', async () => {
    mockedCreateClient.mockReturnValue({
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('NOTPONG'),
      quit: jest.fn().mockResolvedValue(undefined),
    });

    const result = await performHealthCheck();

    expect(result.status).toBe('degraded');
    expect(result.checks.redis.status).toBe('degraded');
    expect(result.checks.redis.message).toBe('Ping failed');
  });

  it('should return unhealthy if database fails', async () => {
    mockedQueryRaw.mockRejectedValue(new Error('DB connection lost'));

    const result = await performHealthCheck();

    expect(result.status).toBe('unhealthy');
    expect(result.checks.database.status).toBe('unhealthy');
    expect(result.checks.database.message).toBe('DB connection lost');
  });

  it('should return unhealthy if queue fails', async () => {
    mockedGetJobCounts.mockRejectedValue(new Error('Queue error'));

    const result = await performHealthCheck();

    expect(result.status).toBe('unhealthy');
    expect(result.checks.queue.status).toBe('unhealthy');
    expect(result.checks.queue.message).toBe('Queue error');
  });

  it('should return unhealthy if Redis connect fails', async () => {
    mockedCreateClient.mockReturnValue({
      connect: jest.fn().mockRejectedValue(new Error('Connection refused')),
      ping: jest.fn(),
      quit: jest.fn(),
    });

    const result = await performHealthCheck();

    expect(result.status).toBe('unhealthy');
    expect(result.checks.redis.status).toBe('unhealthy');
    expect(result.checks.redis.message).toBe('Connection refused');
  });

  it('should include job counts when queue is healthy', async () => {
    mockedGetJobCounts.mockResolvedValue({ waiting: 5, active: 2, completed: 100, failed: 1, delayed: 0 });

    const result = await performHealthCheck();

    expect(result.checks.queue.counts).toEqual({
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 1,
      delayed: 0,
    });
  });
});
