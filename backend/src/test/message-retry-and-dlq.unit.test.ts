/**
 * Unit Tests - Message Retry and DLQ System
 * Tests retry policy, error classification, and DLQ operations
 */

/// <reference types="jest" />

import { jest } from '@jest/globals';

// Mock environment variables
process.env.ENABLE_RETRY_DLQ = 'true';
process.env.MESSAGE_RETRY_MAX_ATTEMPTS = '5';
process.env.MESSAGE_RETRY_BASE_DELAY_MS = '1000';
process.env.MESSAGE_RETRY_MAX_DELAY_MS = '300000';
process.env.MESSAGE_RETRY_JITTER = '0.15';
process.env.DLQ_RETENTION_DAYS = '30';
process.env.DLQ_STREAM_PREFIX = 'dlq:whatsapp';

// ============================================================================
// Types Module Tests
// ============================================================================

describe('Retry Policy Types', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('DEFAULT_RETRY_POLICIES should have policies for all message types', async () => {
    const { DEFAULT_RETRY_POLICIES } = await import('../lib/message-retry-and-dlq-system/types');

    const expectedTypes = [
      'MESSAGE_UPSERT',
      'MESSAGE_STATUS_UPDATE',
      'MESSAGE_DELETE',
      'INSTANCE_STATUS_UPDATE',
      'CONTACT_UPDATE',
      'ANALYTICS_EVENT',
      'WEBHOOK_EVENT',
      'DATABASE_CLEANUP',
      'CACHE_REFRESH'
    ];

    for (const type of expectedTypes) {
      expect(DEFAULT_RETRY_POLICIES[type]).toBeDefined();
      expect(DEFAULT_RETRY_POLICIES[type]).toHaveProperty('maxRetries');
      expect(DEFAULT_RETRY_POLICIES[type]).toHaveProperty('baseDelayMs');
      expect(DEFAULT_RETRY_POLICIES[type]).toHaveProperty('maxDelayMs');
      expect(DEFAULT_RETRY_POLICIES[type]).toHaveProperty('jitterFactor');
    }
  });

  test('MESSAGE_UPSERT should have higher max retries than ANALYTICS_EVENT', async () => {
    const { DEFAULT_RETRY_POLICIES } = await import('../lib/message-retry-and-dlq-system/types');

    expect(DEFAULT_RETRY_POLICIES.MESSAGE_UPSERT.maxRetries).toBeGreaterThan(
      DEFAULT_RETRY_POLICIES.ANALYTICS_EVENT.maxRetries
    );
  });
});

// ============================================================================
// Error Classification Tests
// ============================================================================

describe('Error Classification', () => {
  let classifyError: (error: unknown) => any;

  beforeAll(async () => {
    const module = await import('../lib/message-retry-and-dlq-system/retry-policy');
    classifyError = module.classifyError;
  });

  test('should classify 5xx errors as transient', () => {
    const error = new Error('Service temporarily unavailable');
    (error as any).statusCode = 503;
    expect(classifyError(error)).toBe('transient');
  });

  test('should classify 429 (rate limit) as transient', () => {
    const error = new Error('Too many requests');
    (error as any).statusCode = 429;
    expect(classifyError(error)).toBe('transient');
  });

  test('should classify 4xx errors (except 429) as permanent', () => {
    const error = new Error('Not found');
    (error as any).statusCode = 404;
    expect(classifyError(error)).toBe('permanent');
  });

  test('should classify validation errors as permanent', () => {
    const error = new Error('Validation error: invalid payload');
    expect(classifyError(error)).toBe('permanent');
  });

  test('should classify Prisma duplicate key errors as permanent', () => {
    const error = new Error('Unique constraint failed');
    (error as any).code = 'P2002';
    expect(classifyError(error)).toBe('permanent');
  });

  test('should classify network timeouts as transient', () => {
    const error = new Error('Request timeout after 30s');
    expect(classifyError(error)).toBe('transient');
  });

  test('should classify Redis connection errors as transient', () => {
    const error = new Error('Redis connection refused');
    expect(classifyError(error)).toBe('transient');
  });

  test('should classify unknown errors as transient (safe default)', () => {
    const error = new Error('Some weird error');
    expect(classifyError(error)).toBe('transient');
  });

  test('should handle null/undefined errors gracefully', () => {
    expect(classifyError(null)).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
  });
});

// ============================================================================
// Retry Delay Calculation Tests
// ============================================================================

describe('Retry Delay Calculation', () => {
  let calculateRetryDelay: (job: any, attempt: number, error?: unknown) => any;

  beforeAll(async () => {
    const module = await import('../lib/message-retry-and-dlq-system/retry-policy');
    calculateRetryDelay = module.calculateRetryDelay;
  });

  test('should calculate exponential backoff with jitter', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const delay = calculateRetryDelay(job, 1);

    // First attempt with base 1000ms should be around 1000ms ± jitter
    expect(delay.delayMs).toBeGreaterThanOrEqual(850); // 1000 * (1 - 0.15)
    expect(delay.delayMs).toBeLessThanOrEqual(1150);    // 1000 * (1 + 0.15)
    expect(delay.jitter).toBeGreaterThanOrEqual(0);
    expect(delay.jitter).toBeLessThanOrEqual(0.15);
    expect(delay.attempt).toBe(1);
    expect(delay.maxAttempts).toBe(5);
  });

  test('should double delay on each retry attempt', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const delay1 = calculateRetryDelay(job, 1);
    const delay2 = calculateRetryDelay(job, 2);
    const delay3 = calculateRetryDelay(job, 3);

    // Second attempt should be roughly double the first
    expect(delay2.delayMs).toBeGreaterThan(delay1.delayMs * 1.5);
    expect(delay3.delayMs).toBeGreaterThan(delay2.delayMs * 1.5);
  });

  test('should cap delay at maxDelayMs', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const delay = calculateRetryDelay(job, 10); // High attempt

    expect(delay.delayMs).toBeLessThanOrEqual(300000); // 5 minutes max
  });

  test('should enforce minimum delay of 100ms', () => {
    const job = { name: 'ANALYTICS_EVENT' }; // Has lower base delay
    const delay = calculateRetryDelay(job, 1);

    expect(delay.delayMs).toBeGreaterThanOrEqual(100);
  });

  test('should return different jitter values for different calls', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const jitterValues = new Set<number>();

    // Generate 20 delays and check jitter variation
    for (let i = 0; i < 20; i++) {
      const delay = calculateRetryDelay(job, 1);
      jitterValues.add(delay.jitter);
    }

    // Should have multiple different jitter values (randomness)
    expect(jitterValues.size).toBeGreaterThan(1);
  });

  test('should use different base delays for different message types', () => {
    const messageUpsert = { name: 'MESSAGE_UPSERT' };
    const analyticsEvent = { name: 'ANALYTICS_EVENT' };

    const delayUpsert = calculateRetryDelay(messageUpsert, 1);
    const delayAnalytics = calculateRetryDelay(analyticsEvent, 1);

    // MESSAGE_UPSERT base is 1000ms, ANALYTICS_EVENT base is 200ms
    expect(delayUpsert.delayMs).toBeGreaterThan(delayAnalytics.delayMs * 3);
  });
});

// ============================================================================
// Should Retry Logic Tests
// ============================================================================

describe('Should Retry Logic', () => {
  let shouldRetry: (job: any, attempt: number, error?: unknown) => boolean;
  let shouldMoveToDlq: (job: any, attempt: number, error?: unknown) => boolean;

  beforeAll(async () => {
    const module = await import('../lib/message-retry-and-dlq-system/retry-policy');
    shouldRetry = module.shouldRetry;
    shouldMoveToDlq = module.shouldMoveToDlq;
  });

  test('should retry transient errors within limit', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const error = new Error('Timeout');
    expect(shouldRetry(job, 1, error)).toBe(true);
    expect(shouldRetry(job, 2, error)).toBe(true);
    expect(shouldRetry(job, 5, error)).toBe(false); // At limit
  });

  test('should NOT retry permanent errors', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const error = new Error('Invalid payload');
    (error as any).statusCode = 400;
    expect(shouldRetry(job, 1, error)).toBe(false);
    expect(shouldMoveToDlq(job, 1, error)).toBe(true);
  });

  test('should move to DLQ when retries exhausted', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const error = new Error('Timeout');
    expect(shouldMoveToDlq(job, 6, error)).toBe(true); // Exceeds max 5
  });

  test('should respect message-type specific retry limits', () => {
    const job = { name: 'ANALYTICS_EVENT' }; // Only 2 retries
    const error = new Error('Timeout');

    expect(shouldRetry(job, 1, error)).toBe(true);
    expect(shouldRetry(job, 2, error)).toBe(false); // Only 2 retries allowed
  });
});

// ============================================================================
// DLQ Storage Tests (with mocks)
// ============================================================================

describe('DLQ Storage', () => {
  let mockRedis: any;
  let dlqFunctions: any;

  beforeEach(async () => {
    // Reset environment
    process.env.ENABLE_RETRY_DLQ = 'true';

    // Reset mocks
    mockRedis = {
      xadd: jest.fn(),
      xrange: jest.fn(),
      xlen: jest.fn(),
      xrevrange: jest.fn(),
      xdel: jest.fn(),
      scan: jest.fn(),
      del: jest.fn(),
      xgroup: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG')
    };

    jest.isolateModules(() => {
      require.cache = new Map(); // Clear cache
    });
  });

  test('should store failed job in DLQ with metadata', async () => {
    const { addToDlq } = await import('../lib/message-retry-and-dlq-system/dlq');

    // Override Redis client creation
    const dlqModule = await import('../lib/message-retry-and-dlq-system/dlq');
    const originalGetRedis = dlqModule.getRedisClient;
    dlqModule.getRedisClient = jest.fn().mockResolvedValue(mockRedis);

    const job = {
      id: 'job-123',
      name: 'MESSAGE_UPSERT',
      data: { messageId: 'msg-1', chatId: 'chat-1' }
    };
    const error = new Error('Database timeout');

    mockRedis.xadd.mockResolvedValue('123456-0');

    const entryId = await addToDlq(job as any, error, 3);

    expect(mockRedis.xadd).toHaveBeenCalledWith(
      expect.stringContaining('dlq:whatsapp:MESSAGE_UPSERT'),
      '*',
      'data',
      expect.stringContaining('originalJobId'),
      'job-123',
      expect.any(String),
      'MESSAGE_UPSERT',
      expect.any(String),
      'transient' // error category
    );
    expect(entryId).toBe('123456-0');
  });

  test('should retrieve DLQ entry by ID', async () => {
    const { getDlqEntry } = await import('../lib/message-retry-and-dlq-system/dlq');

    const dlqModule = await import('../lib/message-retry-and-dlq-system/dlq');
    dlqModule.getRedisClient = jest.fn().mockResolvedValue(mockRedis);

    const mockEntry = [
      '123456-0',
      [
        ['data', JSON.stringify({
          originalJobId: 'job-123',
          messageType: 'MESSAGE_UPSERT',
          error: 'Timeout',
          errorCategory: 'transient',
          retryCount: 3,
          failedAt: '2024-01-01T00:00:00Z',
          payload: { messageId: 'msg-1' }
        })]
      ]
    ];

    mockRedis.xrange.mockResolvedValue([mockEntry]);

    const entry = await getDlqEntry('dlq:whatsapp:MESSAGE_UPSERT', '123456-0');

    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('123456-0');
    expect(entry!.data.originalJobId).toBe('job-123');
    expect(entry!.data.retryCount).toBe(3);
  });

  test('should return null for non-existent entry', async () => {
    const { getDlqEntry } = await import('../lib/message-retry-and-dlq-system/dlq');

    const dlqModule = await import('../lib/message-retry-and-dlq-system/dlq');
    dlqModule.getRedisClient = jest.fn().mockResolvedValue(mockRedis);

    mockRedis.xrange.mockResolvedValue([]);

    const entry = await getDlqEntry('dlq:whatsapp:MESSAGE_UPSERT', 'nonexistent');

    expect(entry).toBeNull();
  });
});

// ============================================================================
// Feature Flag Tests
// ============================================================================

describe('Feature Flags', () => {
  test('should detect ENABLE_RETRY_DLQ flag', async () => {
    process.env.ENABLE_RETRY_DLQ = 'true';
    const { isRetryDlqEnabled } = await import('../lib/message-retry-and-dlq-system/types');
    expect(isRetryDlqEnabled()).toBe(true);

    process.env.ENABLE_RETRY_DLQ = 'false';
    // Need to reimport to get fresh value
    jest.resetModules();
    const { isRetryDlqEnabled: checkAgain } = await import('../lib/message-retry-and-dlq-system/types');
    expect(checkAgain()).toBe(false);
  });
});

// ============================================================================
// Retry Summary Utility Tests
// ============================================================================

describe('Retry Summary', () => {
  let getRetrySummary: any;

  beforeAll(async () => {
    const module = await import('../lib/message-retry-and-dlq-system/retry-policy');
    getRetrySummary = module.getRetrySummary;
  });

  test('should indicate when job should be retried', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const transientError = new Error('Timeout');

    const summary1 = getRetrySummary(job, 1, transientError);
    expect(summary1.shouldRetry).toBe(true);
    expect(summary1.remainingRetries).toBeGreaterThan(0);
    expect(summary1.errorCategory).toBe('transient');
    expect(summary1.nextDelay).toBeDefined();

    const summary3 = getRetrySummary(job, 3, transientError);
    expect(summary3.remainingRetries).toBeLessThan(summary1.remainingRetries);
  });

  test('should indicate when job should go to DLQ', () => {
    const job = { name: 'MESSAGE_UPSERT' };
    const permanentError = new Error('Invalid payload');
    (permanentError as any).statusCode = 400;

    const summary = getRetrySummary(job, 1, permanentError);
    expect(summary.shouldRetry).toBe(false);
    expect(summary.errorCategory).toBe('permanent');
    expect(summary.nextDelay).toBeUndefined();
  });
});
