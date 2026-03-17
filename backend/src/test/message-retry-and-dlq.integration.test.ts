/**
 * Integration Tests - Message Retry and DLQ System
 * Tests end-to-end failure handling with BullMQ and Redis
 */

/// <reference types="jest" />

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

// Configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const QUEUE_NAME = 'test-retry-dlq-queue';

const redisConnectionOptions: Redis.RedisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD
};

// ============================================================================
// Test Scenarios
// ============================================================================

describe('Message Retry & DLQ Integration', () => {
  let queue: Queue;
  let worker: Worker;
  let redisClient: Redis;

  // Helper to create a test job that can fail
  const createFailingProcessor = (failCount: number, errorType: 'transient' | 'permanent') => {
    return async (job: Job) => {
      const attempt = job.attemptsMade;
      if (attempt < failCount) {
        const error = errorType === 'transient'
          ? new Error('Temporary timeout')
          : new Error('Invalid payload');
        (error as any).statusCode = errorType === 'transient' ? 503 : 400;
        throw error;
      }
      // Success after failCount attempts
      return { result: 'success' };
    };
  };

  beforeAll(async () => {
    // Test Redis connection
    redisClient = new Redis(redisConnectionOptions);
    const pong = await redisClient.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis not available for integration tests');
    }

    // Clean up any existing queue data
    await redisClient.redis.sendCommand(['FLUSHDB']);
    console.log('[IntegrationTest] Redis DB flushed');
  });

  afterAll(async () => {
    await worker?.close();
    await queue?.close();
    await redisClient.quit();
  });

  beforeEach(async () => {
    // Create fresh queue and worker for each test
    queue = new Queue(QUEUE_NAME, {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false, // Keep failed jobs for inspection
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    });

    worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        // Default processor - can be overridden in tests
        return { result: 'processed' };
      },
      {
        connection: redisConnectionOptions,
        concurrency: 2
      }
    );

    // Wait for worker to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await worker.close();
    await queue.close();
  });

  // ------------------------------------------------------------------------
  // Test 1: Job succeeds after retry (transient error)
  // ------------------------------------------------------------------------

  test('should retry transient error until success', async () => {
    const failCount = 2;
    const processor = createFailingProcessor(failCount, 'transient');

    // Replace worker processor
    await worker.close();
    worker = new Worker(
      QUEUE_NAME,
      processor,
      {
        connection: redisConnectionOptions,
        concurrency: 1
      }
    );

    // Add a job
    const job = await queue.add('test_transient', { value: 'test' });

    // Wait for completion
    const completedJob = await job.waitUntilFinished(60000);

    expect(completedJob).not.toBeNull();
    expect(completedJob?.status).toBe('completed');
    expect(completedJob?.attemptsMade).toBeLessThanOrEqual(failCount + 1);
  }, 60000);

  // ------------------------------------------------------------------------
  // Test 2: Job moves to failed state after max retries
  // ------------------------------------------------------------------------

  test('should fail after max retries with transient error', async () => {
    const failCount = 10; // More than max attempts (5)
    const processor = createFailingProcessor(failCount, 'transient');

    await worker.close();
    worker = new Worker(
      QUEUE_NAME,
      processor,
      {
        connection: redisConnectionOptions,
        concurrency: 1
      }
    );

    const job = await queue.add('test_max_retries', { value: 'test' });

    // Wait for job to be failed
    const failedJob = await job.waitUntilFailed(60000);

    expect(failedJob).not.toBeNull();
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.attemptsMade).toBe(5); // Should attempt 5 times
  }, 60000);

  // ------------------------------------------------------------------------
  // Test 3: Permanent error doesn't retry
  // ------------------------------------------------------------------------

  test('should NOT retry permanent errors', async () => {
    const processor = createFailingProcessor(1, 'permanent');

    await worker.close();
    worker = new Worker(
      QUEUE_NAME,
      processor,
      {
        connection: redisConnectionOptions,
        concurrency: 1
      }
    );

    const job = await queue.add('test_permanent', { value: 'test' });

    const failedJob = await job.waitUntilFailed(60000);

    expect(failedJob).not.toBeNull();
    expect(failedJob?.status).toBe('failed');
    // Should fail on first attempt (no retry for permanent errors)
    expect(failedJob?.attemptsMade).toBe(1);
  }, 60000);

  // ------------------------------------------------------------------------
  // Test 4: Backoff delays increase exponentially
  // ------------------------------------------------------------------------

  test('should apply exponential backoff between retries', async () => {
    // This test tracks delay between retry attempts
    const failCount = 3;
    const attemptTimes: number[] = [];
    const processor = async (job: Job) => {
      const attempt = job.attemptsMade;
      attemptTimes.push(Date.now());
      if (attempt < failCount) {
        throw new Error('Timeout');
      }
      return { result: 'success' };
    };

    await worker.close();
    worker = new Worker(
      QUEUE_NAME,
      processor,
      {
        connection: redisConnectionOptions,
        concurrency: 1
      }
    );

    const startTime = Date.now();
    const job = await queue.add('test_backoff', { value: 'test' });
    await job.waitUntilFinished(60000);

    // Should have recorded attempt times
    expect(attemptTimes.length).toBeGreaterThanOrEqual(failCount + 1);

    // Check that retry delays are at least the minimum expected
    if (attemptTimes.length >= 2) {
      const delays = [];
      for (let i = 1; i < attemptTimes.length; i++) {
        delays.push(attemptTimes[i] - attemptTimes[i - 1]);
      }

      // Second retry should have longer delay than first
      if (delays.length >= 2) {
        expect(delays[1] - delays[0]).toBeGreaterThan(0);
      }
    }
  }, 60000);

  // ------------------------------------------------------------------------
  // Test 5: Concurrent failures don't interfere
  // ------------------------------------------------------------------------

  test('should handle concurrent job failures independently', async () => {
    const jobCount = 5;
    const failCount = 2;
    const processor = createFailingProcessor(failCount, 'transient');

    await worker.close();
    worker = new Worker(
      QUEUE_NAME,
      processor,
      {
        connection: redisConnectionOptions,
        concurrency: 2
      }
    );

    // Add multiple jobs
    const jobs = [];
    for (let i = 0; i < jobCount; i++) {
      const job = await queue.add('test_concurrent', { index: i });
      jobs.push(job);
    }

    // Wait for all to complete
    const results = await Promise.all(
      jobs.map(job => job.waitUntilFinished(60000))
    );

    expect(results.length).toBe(jobCount);
    let successCount = 0;
    for (const result of results) {
      if (result?.status === 'completed') successCount++;
    }

    // All should eventually succeed
    expect(successCount).toBe(jobCount);
  }, 120000);

  // ------------------------------------------------------------------------
  // Test 6: Error classification affects retry behavior
  // ------------------------------------------------------------------------

  test('should differentiate between transient and permanent errors', async () => {
    // Job with permanent error on first attempt
    const permanentProcessor = async (job: Job) => {
      if (job.attemptsMade === 1) {
        const error = new Error('Invalid data');
        (error as any).statusCode = 422;
        throw error;
      }
      return { result: 'success' };
    };

    await worker.close();
    worker = new Worker(
      QUEUE_NAME + '_perm',
      permanentProcessor,
      { connection: redisConnectionOptions, concurrency: 1 }
    );

    const job1 = await queue.add('test_classify_perm', { value: 'test' });
    const failedJob = await job1.waitUntilFailed(60000);

    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.attemptsMade).toBe(1); // No retries

    // Job with transient error
    const transientProcessor = async (job: Job) => {
      if (job.attemptsMade < 3) {
        throw new Error('Timeout');
      }
      return { result: 'success' };
    };

    await worker.close();
    worker = new Worker(
      QUEUE_NAME + '_trans',
      transientProcessor,
      { connection: redisConnectionOptions, concurrency: 1 }
    );

    const job2 = await queue.add('test_classify_trans', { value: 'test' });
    const completedJob = await job2.waitUntilFinished(60000);

    expect(completedJob?.status).toBe('completed');
    expect(completedJob?.attemptsMade).toBeGreaterThanOrEqual(3);
  }, 120000);
});

// ============================================================================
// DLQ Standalone Tests
// ============================================================================

describe('DLQ Storage Operations', () => {
  let redisClient: Redis;
  let testStreamKey: string;

  beforeAll(async () => {
    redisClient = new Redis(redisConnectionOptions);
    testStreamKey = `dlq:test:${Date.now()}`;
    await redisClient.flushdb();
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  test('should store and retrieve DLQ entry', async () => {
    const metadata = {
      originalJobId: 'job-123',
      messageType: 'MESSAGE_UPSERT',
      error: 'Database connection timeout',
      errorCategory: 'transient',
      retryCount: 3,
      failedAt: new Date().toISOString(),
      payload: { messageId: 'msg-1', chatId: 'chat-1' }
    };

    // Add to Redis stream
    const entryId = await redisClient.xadd(
      testStreamKey,
      '*',
      'data',
      JSON.stringify(metadata),
      'timestamp',
      metadata.failedAt,
      'messageType',
      metadata.messageType
    );

    expect(entryId).toBeDefined();

    // Retrieve
    const result = await redisClient.xrange(testStreamKey, entryId, entryId);
    expect(result.length).toBe(1);

    const [, fields] = result[0];
    const dataField = fields.find((f: [string, string]) => f[0] === 'data');
    const retrieved = JSON.parse(dataField![1]);

    expect(retrieved.originalJobId).toBe(metadata.originalJobId);
    expect(retrieved.retryCount).toBe(metadata.retryCount);
  });

  test('should list stream entries with pagination', async () => {
    // Add multiple entries
    for (let i = 0; i < 10; i++) {
      await redisClient.xadd(
        testStreamKey,
        '*',
        'data',
        JSON.stringify({
          originalJobId: `job-${i}`,
          messageType: 'MESSAGE_UPSERT',
          error: 'Timeout',
          errorCategory: 'transient',
          retryCount: i
        })
      );
    }

    // List first 5
    const result = await redisClient.xrevrange(testStreamKey, '+', '-', 'COUNT', 5);
    expect(result.length).toBe(5);

    // List all
    const all = await redisClient.xrevrange(testStreamKey, '+', '-');
    expect(all.length).toBe(10);
  });

  test('should delete specific entries', async () => {
    // Add entry
    const entryId = await redisClient.xadd(
      testStreamKey,
      '*',
      'data',
      JSON.stringify({ test: true })
    );

    // Delete it
    const deleted = await redisClient.xdel(testStreamKey, entryId);
    expect(deleted).toBe(1);

    // Verify deleted
    const result = await redisClient.xrange(testStreamKey, entryId, entryId);
    expect(result.length).toBe(0);
  });
});
