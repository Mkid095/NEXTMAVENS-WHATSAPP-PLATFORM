/**
 * Unit Tests - Workflow Orchestration System
 * Tests retry policy, queue operations, engine, processor, and compensation
 */

/// <reference types="jest" />

import { jest } from '@jest/globals';

// Mock environment variables
process.env.QUEUE_CONCURRENCY = '10';
process.env.ENABLE_RETRY_DLQ = 'true';
process.env.MESSAGE_RETRY_MAX_ATTEMPTS = '5';

// ============================================================================
// Setup Mocks
// ============================================================================

// Mock Prisma
const mockPrisma = {
  workflowDefinition: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    updateMany: jest.fn(),
  },
  workflowInstance: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findByInstanceId: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  workflowStepHistory: {
    create: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('../lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock message queue system
const mockMessageQueue = {
  add: jest.fn(),
  getWaitingCount: jest.fn(),
  getActiveCount: jest.fn(),
  getCompletedCount: jest.fn(),
  getFailedCount: jest.fn(),
  getDelayedCount: jest.fn(),
};

const mockQueueScheduler = {
  close: jest.fn(),
  on: jest.fn(),
};

jest.mock('../lib/message-queue-priority-system', () => ({
  messageQueue: mockMessageQueue,
  queueScheduler: mockQueueScheduler,
  MessagePriority: {
    LOW: -1,
    MEDIUM: 0,
    HIGH: 2,
    CRITICAL: 3,
  },
  MessageType: {
    MESSAGE_UPSERT: 'MESSAGE_UPSERT',
    MESSAGE_STATUS_UPDATE: 'MESSAGE_STATUS_UPDATE',
    ANALYTICS_EVENT: 'ANALYTICS_EVENT',
  },
  getPriorityForType: jest.fn(() => 0),
}));

// Mock socket service
const mockSocketService = {
  broadcastToOrg: jest.fn(),
};

jest.mock('../lib/build-real-time-messaging-with-socket.io', () => ({
  getSocketService: jest.fn(() => mockSocketService),
}));

// Mock metrics (optional)
const mockMetrics = {
  workflowInstancesTotal: { inc: jest.fn(), dec: jest.fn() },
  workflowStepsCompletedTotal: { inc: jest.fn() },
  workflowStepsFailedTotal: { inc: jest.fn() },
  workflowCompensationsTriggeredTotal: { inc: jest.fn() },
  workflowDurationSeconds: { observe: jest.fn() },
  workflowStepDurationSeconds: { observe: jest.fn() },
};

jest.mock('../lib/create-comprehensive-metrics-dashboard-(grafana)/index', () => ({
  workflowInstancesTotal: mockMetrics.workflowInstancesTotal,
  workflowStepsCompletedTotal: mockMetrics.workflowStepsCompletedTotal,
  workflowStepsFailedTotal: mockMetrics.workflowStepsFailedTotal,
  workflowCompensationsTriggeredTotal: mockMetrics.workflowCompensationsTriggeredTotal,
  workflowDurationSeconds: mockMetrics.workflowDurationSeconds,
  workflowStepDurationSeconds: mockMetrics.workflowStepDurationSeconds,
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...process.env }; // Reset to fresh copy
});

// ============================================================================
// Types Module Tests
// ============================================================================

describe('Workflow Types', () => {
  test('should export all required types', async () => {
    const types = await import('../lib/workflow-orchestration/types');

    expect(types.WorkflowStatus).toBeDefined();
    expect(types.WorkflowStepStatus).toBeDefined();
    expect(types.WorkflowStep).toBeDefined();
    expect(types.WorkflowDefinition).toBeDefined();
    expect(types.WorkflowInstance).toBeDefined();
    expect(types.WorkflowStepHistory).toBeDefined();
    expect(types.RetryPolicy).toBeDefined();
  });

  test('WorkflowStatus enum should have correct values', async () => {
    const { WorkflowStatus } = await import('../lib/workflow-orchestration/types');

    expect(WorkflowStatus.PENDING).toBe('PENDING');
    expect(WorkflowStatus.RUNNING).toBe('RUNNING');
    expect(WorkflowStatus.COMPLETED).toBe('COMPLETED');
    expect(WorkflowStatus.FAILED).toBe('FAILED');
    expect(WorkflowStatus.CANCELLED).toBe('CANCELLED');
    expect(WorkflowStatus.COMPENSATING).toBe('COMPENSATING');
    expect(WorkflowStatus.COMPENSATED).toBe('COMPENSATED');
  });
});

// ============================================================================
// Retry Policy Tests
// ============================================================================

describe('Retry Policy', () => {
  let calculateRetryDelay: (attempt: number, policy: any) => number;
  let shouldRetry: (attempt: number, error: Error, policy: any) => boolean;
  let classifyError: (error: unknown) => string;
  let resolveRetryPolicy: (actionType: string, stepPolicy?: any, defaultPolicy?: any) => any;
  let DEFAULT_RETRY_POLICIES: Record<string, any>;

  beforeAll(async () => {
    const module = await import('../lib/workflow-orchestration/retry-policy');
    calculateRetryDelay = module.calculateRetryDelay;
    shouldRetry = module.shouldRetry;
    classifyError = module.classifyError;
    resolveRetryPolicy = module.resolveRetryPolicy;
    DEFAULT_RETRY_POLICIES = module.DEFAULT_RETRY_POLICIES;
  });

  describe('DEFAULT_RETRY_POLICIES', () => {
    test('should have policies for all action types', () => {
      expect(DEFAULT_RETRY_POLICIES['send-message']).toBeDefined();
      expect(DEFAULT_RETRY_POLICIES['send-template']).toBeDefined();
      expect(DEFAULT_RETRY_POLICIES['api-call']).toBeDefined();
      expect(DEFAULT_RETRY_POLICIES['default']).toBeDefined();
    });

    test('message types should have higher retry count than analytics', () => {
      expect(DEFAULT_RETRY_POLICIES['send-message'].maxAttempts).toBeGreaterThan(
        DEFAULT_RETRY_POLICIES['default'].maxAttempts
      );
    });

    test('all policies should have required fields', () => {
      for (const policy of Object.values(DEFAULT_RETRY_POLICIES)) {
        expect(policy).toHaveProperty('maxAttempts');
        expect(policy).toHaveProperty('baseDelayMs');
        expect(policy).toHaveProperty('maxDelayMs');
        expect(policy).toHaveProperty('jitterFactor');
        expect(policy.maxAttempts).toBeGreaterThan(0);
        expect(policy.baseDelayMs).toBeGreaterThanOrEqual(0);
        expect(policy.maxDelayMs).toBeGreaterThan(0);
        expect(policy.jitterFactor).toBeGreaterThanOrEqual(0);
        expect(policy.jitterFactor).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('calculateRetryDelay', () => {
    test('should return increasing delay with exponential backoff', () => {
      const policy = { baseDelayMs: 1000, maxDelayMs: 300000, jitterFactor: 0.1 };
      const delay1 = calculateRetryDelay(1, policy);
      const delay2 = calculateRetryDelay(2, policy);
      const delay3 = calculateRetryDelay(3, policy);

      // With exponential backoff, delays should increase (base * 2^(attempt-1))
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    test('should respect maxDelayMs cap', () => {
      const policy = { baseDelayMs: 1000, maxDelayMs: 5000, jitterFactor: 0 };
      const delay10 = calculateRetryDelay(10, policy);

      expect(delay10).toBeLessThanOrEqual(policy.maxDelayMs);
    });

    test('should include jitter (between base and max)', () => {
      const policy = { baseDelayMs: 1000, maxDelayMs: 10000, jitterFactor: 0.2 };
      const baseDelay = 1000 * Math.pow(2, 3 - 1); // 2000 for attempt 3

      // Run multiple times to check jitter variation
      const delays = new Set();
      for (let i = 0; i < 100; i++) {
        delays.add(calculateRetryDelay(3, policy));
      }

      // With jitter, should have multiple different values
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('shouldRetry', () => {
    test('should return true for transient errors within max attempts', () => {
      const policy = { maxAttempts: 3 };
      const transientError = new Error('Service unavailable');
      (transientError as any).statusCode = 503;

      expect(shouldRetry(1, transientError, policy)).toBe(true);
      expect(shouldRetry(2, transientError, policy)).toBe(true);
      expect(shouldRetry(3, transientError, policy)).toBe(false); // Equal to max, no retry
    });

    test('should return false for permanent errors', () => {
      const policy = { maxAttempts: 3 };
      const permanentError = new Error('Not found');
      (permanentError as any).statusCode = 404;

      expect(shouldRetry(1, permanentError, policy)).toBe(false);
    });

    test('should return false for duplicate key errors', () => {
      const policy = { maxAttempts: 3 };
      const duplicateError = new Error('Unique constraint failed');
      (duplicateError as any).code = 'P2002';

      expect(shouldRetry(1, duplicateError, policy)).toBe(false);
    });

    test('should return false for validation errors', () => {
      const policy = { maxAttempts: 3 };
      const validationError = new Error('Validation failed');

      expect(shouldRetry(1, validationError, policy)).toBe(false);
    });

    test('should return true for unknown errors within limit', () => {
      const policy = { maxAttempts: 5 };
      const unknownError = new Error('Something broke');

      expect(shouldRetry(1, unknownError, policy)).toBe(true);
      expect(shouldRetry(4, unknownError, policy)).toBe(true);
      expect(shouldRetry(5, unknownError, policy)).toBe(false);
    });
  });

  describe('classifyError', () => {
    test('should classify 5xx errors as transient', () => {
      expect(classifyError(new Error('Error') as any)).toBe('transient');
    });

    test('should classify 429 as transient', () => {
      const error = new Error('Rate limited');
      (error as any).statusCode = 429;
      expect(classifyError(error)).toBe('transient');
    });

    test('should classify 4xx (except 429) as permanent', () => {
      const error = new Error('Not found');
      (error as any).statusCode = 404;
      expect(classifyError(error)).toBe('permanent');
    });

    test('should classify Prisma P2002 as permanent', () => {
      const error = new Error('Unique constraint');
      (error as any).code = 'P2002';
      expect(classifyError(error)).toBe('permanent');
    });

    test('should classify validation errors as permanent', () => {
      const error = new Error('Validation: invalid payload');
      expect(classifyError(error)).toBe('permanent');
    });

    test('should classify unknown errors as unknown category', () => {
      const error = new Error('Unknown error');
      expect(classifyError(error)).toBe('unknown');
    });
  });

  describe('resolveRetryPolicy', () => {
    test('should return workflow default when step has no override', () => {
      const defaultPolicy = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 300000, jitterFactor: 0.1 };
      const resolved = resolveRetryPolicy('default', undefined, defaultPolicy);

      expect(resolved).toEqual(defaultPolicy);
    });

    test('should return step-specific policy when provided', () => {
      const defaultPolicy = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 300000, jitterFactor: 0.1 };
      const stepPolicy = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 10000, jitterFactor: 0.2 };
      const resolved = resolveRetryPolicy('default', stepPolicy, defaultPolicy);

      expect(resolved).toEqual(stepPolicy);
    });

    test('should return action-type specific default from DEFAULT_RETRY_POLICIES', () => {
      const resolved = resolveRetryPolicy('send-message', undefined, undefined);
      expect(resolved).toBeDefined();
      expect(resolved.maxAttempts).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Queue Tests
// ============================================================================

describe('Workflow Queue', () => {
  let enqueueWorkflowStep: (data: any, options?: any) => Promise<any>;
  let generateInstanceId: () => string;
  let generateStepDeduplicationId: (instanceId: string, stepIndex: number) => string;

  beforeAll(async () => {
    const module = await import('../lib/workflow-orchestration/queue');
    enqueueWorkflowStep = module.enqueueWorkflowStep;
    generateInstanceId = module.generateInstanceId;
    generateStepDeduplicationId = module.generateStepDeduplicationId;
  });

  describe('enqueueWorkflowStep', () => {
    test('should enqueue job with correct type and default priority', async () => {
      mockMessageQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const jobData = {
        instanceId: 'wf_123',
        workflowId: 'test-workflow',
        stepIndex: 0,
        stepName: 'send-welcome',
        orgId: 'org-123',
        context: {},
      };

      const job = await enqueueWorkflowStep(jobData);

      expect(mockMessageQueue.add).toHaveBeenCalledWith(
        'WORKFLOW_STEP',
        jobData,
        expect.objectContaining({
          priority: 0, // normal priority
        })
      );
      expect(job.id).toBe('job-123');
    });

    test('should respect custom priority', async () => {
      mockMessageQueue.add.mockResolvedValue({ id: 'job-456' } as any);

      const jobData = {
        instanceId: 'wf_123',
        workflowId: 'test-workflow',
        stepIndex: 0,
        stepName: 'urgent-action',
        orgId: 'org-123',
        context: {},
      };

      await enqueueWorkflowStep(jobData, { priority: 'high' });

      expect(mockMessageQueue.add).toHaveBeenCalledWith(
        'WORKFLOW_STEP',
        jobData,
        expect.objectContaining({
          priority: 2, // high priority
        })
      );
    });

    test('should include delay when specified', async () => {
      mockMessageQueue.add.mockResolvedValue({ id: 'job-789' } as any);

      const jobData = {
        instanceId: 'wf_123',
        workflowId: 'test-workflow',
        stepIndex: 0,
        stepName: 'delayed-step',
        orgId: 'org-123',
        context: {},
      };

      await enqueueWorkflowStep(jobData, { delayMs: 60000 });

      expect(mockMessageQueue.add).toHaveBeenCalledWith(
        'WORKFLOW_STEP',
        jobData,
        expect.objectContaining({
          delay: 60000,
        })
      );
    });

    test('should include parent job ID when provided', async () => {
      mockMessageQueue.add.mockResolvedValue({ id: 'job-999' } as any);

      const jobData = {
        instanceId: 'wf_123',
        workflowId: 'test-workflow',
        stepIndex: 1,
        stepName: 'child-step',
        orgId: 'org-123',
        context: {},
      };

      await enqueueWorkflowStep(jobData, { parentJobId: 'parent-123' });

      expect(mockMessageQueue.add).toHaveBeenCalledWith(
        'WORKFLOW_STEP',
        jobData,
        expect.objectContaining({
          parent: 'parent-123',
        })
      );
    });
  });

  describe('Utility Functions', () => {
    test('generateInstanceId should create unique IDs with prefix', () => {
      const id1 = generateInstanceId();
      const id2 = generateInstanceId();

      expect(id1).toMatch(/^wf_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^wf_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    test('generateStepDeduplicationId should create consistent IDs', () => {
      const instanceId = 'wf_12345';
      const stepIndex = 2;

      const id1 = generateStepDeduplicationId(instanceId, stepIndex);
      const id2 = generateStepDeduplicationId(instanceId, stepIndex);

      expect(id1).toBe(`${instanceId}:step:${stepIndex}`);
      expect(id1).toBe(id2);
    });
  });

  describe('getWorkflowQueueMetrics', () => {
    let getWorkflowQueueMetrics: () => Promise<any>;

    beforeAll(async () => {
      const module = await import('../lib/workflow-orchestration/queue');
      getWorkflowQueueMetrics = module.getWorkflowQueueMetrics;
    });

    test('should return metrics with correct structure', async () => {
      mockMessageQueue.getWaitingCount.mockResolvedValue(10);
      mockMessageQueue.getActiveCount.mockResolvedValue(5);
      mockMessageQueue.getCompletedCount.mockResolvedValue(100);
      mockMessageQueue.getFailedCount.mockResolvedValue(2);
      mockMessageQueue.getDelayedCount.mockResolvedValue(3);

      const metrics = await getWorkflowQueueMetrics();

      expect(metrics).toHaveProperty('totalWorkflowSteps');
      expect(metrics).toHaveProperty('activeWorkflowSteps');
      expect(metrics).toHaveProperty('completedWorkflowSteps');
      expect(metrics).toHaveProperty('failedWorkflowSteps');
      expect(metrics).toHaveProperty('delayedWorkflowSteps');
      expect(metrics).toHaveProperty('waitingWorkflowSteps');

      expect(metrics.totalWorkflowSteps).toBe(120); // 10+5+100+2+3
      expect(metrics.activeWorkflowSteps).toBe(5);
      expect(metrics.completedWorkflowSteps).toBe(100);
      expect(metrics.failedWorkflowSteps).toBe(2);
      expect(metrics.delayedWorkflowSteps).toBe(3);
      expect(metrics.waitingWorkflowSteps).toBe(10);
    });
  });
});

// ============================================================================
// Workflow Engine Tests
// ============================================================================

describe('Workflow Engine', () => {
  let createWorkflowInstance: any;
  let advanceStep: any;
  let failWorkflow: any;
  let cancelWorkflow: any;
  let compensateWorkflow: any;
  let loadInstance: any;

  beforeAll(async () => {
    const engine = await import('../lib/workflow-orchestration/engine');
    createWorkflowInstance = engine.createWorkflowInstance;
    advanceStep = engine.advanceStep;
    failWorkflow = engine.failWorkflow;
    cancelWorkflow = engine.cancelWorkflow;
    compensateWorkflow = engine.compensateWorkflow;
    loadInstance = engine.loadInstance;
  });

  describe('createWorkflowInstance', () => {
    test('should create instance with PENDING status', async () => {
      const mockDefinition = {
        id: 'def_123',
        workflowId: 'test-wf',
        name: 'Test Workflow',
        steps: [{ name: 'step1', action: { type: 'message' as const, config: {} } }],
        isActive: true,
        createdBy: 'user-123',
      };

      mockPrisma.workflowDefinition.findUnique.mockResolvedValue(mockDefinition as any);
      mockPrisma.workflowInstance.create.mockResolvedValue({
        id: 'inst_123',
        instanceId: 'wf_inst_123',
        definitionId: 'def_123',
        status: 'PENDING',
        currentStep: null,
        contextJson: {},
        startedAt: new Date(),
        orgId: 'org-123',
      } as any);

      const result = await createWorkflowInstance('def_123', 'org-123', {
        context: { foo: 'bar' },
      });

      expect(result).toHaveProperty('instanceId');
      expect(mockPrisma.workflowInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            instanceId: expect.stringMatching(/^wf_\d+_[a-z0-9]+$/),
            definitionId: 'def_123',
            status: 'PENDING',
            currentStep: null,
            contextJson: { foo: 'bar' },
            orgId: 'org-123',
          }),
        })
      );
    });

    test('should use default empty context if none provided', async () => {
      const mockDefinition = {
        id: 'def_123',
        workflowId: 'test-wf',
        name: 'Test Workflow',
        steps: [],
        isActive: true,
        createdBy: 'user-123',
      };

      mockPrisma.workflowDefinition.findUnique.mockResolvedValue(mockDefinition as any);
      mockPrisma.workflowInstance.create.mockResolvedValue({
        id: 'inst_123',
        instanceId: 'wf_inst_123',
        definitionId: 'def_123',
        status: 'PENDING',
        contextJson: {},
        orgId: 'org-123',
      } as any);

      await createWorkflowInstance('def_123', 'org-123');

      expect(mockPrisma.workflowInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contextJson: {},
          }),
        })
      );
    });
  });

  describe('loadInstance', () => {
    test('should load instance with definition', async () => {
      const mockInstance = {
        id: 'inst_123',
        instanceId: 'wf_inst_123',
        definitionId: 'def_123',
        status: 'RUNNING',
        currentStep: 1,
        contextJson: { test: 'data' },
        orgId: 'org-123',
      };

      const mockDefinition = {
        id: 'def_123',
        steps: [{ name: 'step1', action: { type: 'message', config: {} } }],
      };

      mockPrisma.workflowInstance.findUnique.mockResolvedValue(mockInstance as any);
      mockPrisma.workflowDefinition.findUnique.mockResolvedValue(mockDefinition as any);

      const instance = await loadInstance('wf_inst_123');

      expect(instance.instanceId).toBe('wf_inst_123');
      expect(instance.definition).toBeDefined();
      expect(instance.definition.id).toBe('def_123');
    });

    test('should return undefined if instance not found', async () => {
      mockPrisma.workflowInstance.findUnique.mockResolvedValue(null);

      const instance = await loadInstance('nonexistent');

      expect(instance).toBeUndefined();
    });
  });

  describe('advanceStep', () => {
    test('should advance to next step and enqueue', async () => {
      const mockInstance = {
        id: 'inst_123',
        instanceId: 'wf_inst_123',
        definitionId: 'def_123',
        status: 'RUNNING',
        currentStep: 0,
        contextJson: {},
        orgId: 'org-123',
      };

      const mockDefinition = {
        id: 'def_123',
        steps: [
          { name: 'step1', action: { type: 'message', config: {} } },
          { name: 'step2', action: { type: 'delay', config: { delayMs: 1000 } } },
        ],
        compensation: undefined,
      };

      mockPrisma.workflowInstance.findUnique.mockResolvedValue(mockInstance as any);
      mockPrisma.workflowInstance.update.mockResolvedValue({
        ...mockInstance,
        currentStep: 1,
      } as any);
      mockPrisma.workflowStepHistory.updateMany.mockResolvedValue({ count: 1 });

      const { enqueueWorkflowStep } = await import('../lib/workflow-orchestration/queue');
      const enqueueSpy = jest.spyOn(module, 'enqueueWorkflowStep').mockResolvedValue({} as any);

      await advanceStep('wf_inst_123', { success: true, output: {} });

      expect(mockPrisma.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentStep: 1 },
        })
      );
      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          stepIndex: 1,
          stepName: 'step2',
        }),
        expect.any(Object)
      );
    });

    test('should complete workflow when no more steps', async () => {
      const mockInstance = {
        id: 'inst_123',
        instanceId: 'wf_inst_123',
        definitionId: 'def_123',
        status: 'RUNNING',
        currentStep: 1,
        contextJson: {},
        orgId: 'org-123',
      };

      const mockDefinition = {
        id: 'def_123',
        steps: [
          { name: 'step1', action: { type: 'message', config: {} } },
          { name: 'step2', action: { type: 'delay', config: { delayMs: 1000 } } },
        ],
        compensation: undefined,
      };

      mockPrisma.workflowInstance.findUnique.mockResolvedValue(mockInstance as any);
      mockPrisma.workflowInstance.update.mockResolvedValue({
        ...mockInstance,
        status: 'COMPLETED',
        completedAt: new Date(),
      } as any);
      mockPrisma.workflowStepHistory.updateMany.mockResolvedValue({ count: 1 });

      const result = await advanceStep('wf_inst_123', { success: true, output: {} });

      expect(result.completed).toBe(true);
      expect(mockPrisma.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'COMPLETED',
            completedAt: expect.any(Date),
          },
        })
      );
    });
  });

  describe('failWorkflow', () => {
    test('should mark instance as FAILED', async () => {
      const mockInstance = {
        id: 'inst_123',
        instanceId: 'wf_inst_123',
        definitionId: 'def_123',
        status: 'RUNNING',
        orgId: 'org-123',
      };

      mockPrisma.workflowInstance.findUnique.mockResolvedValue(mockInstance as any);
      mockPrisma.workflowInstance.update.mockResolvedValue({
        ...mockInstance,
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: 'Test error',
      } as any);

      await failWorkflow('wf_inst_123', 'Test error', true);

      expect(mockPrisma.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'FAILED',
            failedAt: expect.any(Date),
            failureReason: 'Test error',
          },
        })
      );
    });

    test('should trigger compensation if defined', async () => {
      const mockInstance = {
        id: 'inst_123',
        instanceId: 'wf_inst_123',
        definitionId: 'def_123',
        status: 'RUNNING',
        contextJson: {},
        orgId: 'org-123',
      };

      const mockDefinition = {
        id: 'def_123',
        compensation: {
          type: 'sequential',
          steps: [
            { name: 'comp1', action: { type: 'custom', config: { handler: 'cleanup' } } },
          ],
        },
      };

      mockPrisma.workflowInstance.findUnique.mockResolvedValue(mockInstance as any);
      mockPrisma.workflowDefinition.findUnique.mockResolvedValue(mockDefinition as any);
      mockPrisma.workflowInstance.update.mockResolvedValue({
        ...mockInstance,
        status: 'FAILED',
      } as any);

      const compensateSpy = jest.spyOn(require('../lib/workflow-orchestration/compensation'), 'runCompensation');

      await failWorkflow('wf_inst_123', 'Error', true);

      expect(compensateSpy).toHaveBeenCalledWith('wf_inst_123', mockDefinition.compensation);
    });
  });

  describe('cancelWorkflow', () => {
    test('should cancel instance and trigger compensation', async () => {
      const mockInstance = {
        id: 'inst_123',
        instanceId: 'wf_inst_123',
        definitionId: 'def_123',
        status: 'RUNNING',
        contextJson: {},
        orgId: 'org-123',
      };

      mockPrisma.workflowInstance.findUnique.mockResolvedValue(mockInstance as any);
      mockPrisma.workflowInstance.update.mockResolvedValue({
        ...mockInstance,
        status: 'CANCELLED',
      } as any);

      const compensateSpy = jest.spyOn(require('../lib/workflow-orchestration/compensation'), 'runCompensation');

      const result = await cancelWorkflow('wf_inst_123', 'User cancelled');

      expect(result.success).toBe(true);
      expect(mockPrisma.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'CANCELLED',
            failureReason: 'User cancelled',
          },
        })
      );
      expect(compensateSpy).toHaveBeenCalled();
    });

    test('should fail if instance not found', async () => {
      mockPrisma.workflowInstance.findUnique.mockResolvedValue(null);

      const result = await cancelWorkflow('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Instance not found');
    });
  });
});

// ============================================================================
// Compensation Tests
// ============================================================================

describe('Compensation', () => {
  let runCompensation: (instanceId: string, compensationConfig?: any) => Promise<void>;

  beforeAll(async () => {
    const module = await import('../lib/workflow-orchestration/compensation');
    runCompensation = module.runCompensation;
  });

  test('should execute compensation steps in order', async () => {
    const instanceId = 'wf_inst_123';
    const compensationConfig = {
      type: 'sequential',
      steps: [
        { name: 'cleanup1', action: { type: 'custom', config: { handler: 'cleanup' } } },
        { name: 'rollback', action: { type: 'custom', config: { handler: 'rollback' } } },
      ],
    };

    mockPrisma.workflowStepHistory.create.mockResolvedValue({} as any);

    await runCompensation(instanceId, compensationConfig);

    expect(mockPrisma.workflowStepHistory.create).toHaveBeenCalledTimes(2);
    // First call should be for cleanup1, second for rollback
    const firstCall = mockPrisma.workflowStepHistory.create.mock.calls[0][0].data;
    const secondCall = mockPrisma.workflowStepHistory.create.mock.calls[1][0].data;
    expect(firstCall.stepName).toBe('cleanup1');
    expect(secondCall.stepName).toBe('rollback');
  });

  test('should handle compensation failures gracefully', async () => {
    const instanceId = 'wf_inst_123';
    const compensationConfig = {
      type: 'sequential',
      steps: [
        { name: 'cleanup1', action: { type: 'custom', config: {} } },
        { name: 'failing', action: { type: 'custom', config: {} } },
      ],
    };

    // First call succeeds, second fails
    mockPrisma.workflowStepHistory.create
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce(new Error('Compensation failed'));

    await expect(runCompensation(instanceId, compensationConfig)).rejects.toThrow('Compensation failed');
  });

  test('should set compensation status on instance', async () => {
    const instanceId = 'wf_inst_123';
    const compensationConfig = {
      type: 'sequential',
      steps: [
        { name: 'cleanup', action: { type: 'custom', config: {} } },
      ],
    };

    mockPrisma.workflowStepHistory.create.mockResolvedValue({} as any);
    mockPrisma.workflowInstance.update.mockResolvedValue({} as any);

    await runCompensation(instanceId, compensationConfig);

    expect(mockPrisma.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instanceId },
        data: { status: 'COMPENSATED' },
      })
    );
  });

  test('should return immediately if no compensation defined', async () => {
    const result = await runCompensation('wf_inst_123', undefined);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// Zod Schema Validation Tests
// ============================================================================

describe('Workflow Definition Validation', () => {
  let workflowDefinitionSchema: any;

  beforeAll(async () => {
    const route = await import('../app/api/workflow-orchestration/route');
    workflowDefinitionSchema = route.workflowDefinitionSchema;
  });

  test('should accept valid workflow definition', () => {
    const validDefinition = {
      workflowId: 'test-wf',
      name: 'Test Workflow',
      description: 'A test workflow',
      steps: [
        {
          name: 'send-message',
          action: {
            type: 'message',
            config: {
              to: '+1234567890',
              message: 'Hello!',
              messageType: 'text',
            },
          },
        },
        {
          name: 'call-api',
          action: {
            type: 'api-call',
            config: {
              url: 'https://api.example.com/webhook',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: { event: 'workflow.completed' },
            },
          },
        },
        {
          name: 'delay',
          action: {
            type: 'delay',
            config: { delayMs: 5000 },
          },
        },
      ],
      timeoutMs: 300000,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 60000,
        jitterFactor: 0.1,
      },
    };

    expect(() => workflowDefinitionSchema.parse(validDefinition)).not.toThrow();
  });

  test('should reject missing required fields', () => {
    const invalidDefinition = {
      workflowId: '',
      name: '',
      steps: [],
    };

    expect(() => workflowDefinitionSchema.parse(invalidDefinition)).toThrow();
  });

  test('should reject invalid action types', () => {
    const invalidDefinition = {
      workflowId: 'test-wf',
      name: 'Test',
      steps: [
        {
          name: 'bad-step',
          action: {
            type: 'invalid-type' as any,
            config: {},
          },
        },
      ],
    };

    expect(() => workflowDefinitionSchema.parse(invalidDefinition)).toThrow();
  });

  test('should validate step compensation', () => {
    const definition = {
      workflowId: 'test-wf',
      name: 'Test',
      steps: [
        {
          name: 'step1',
          action: { type: 'delay', config: { delayMs: 1000 } },
          compensation: {
            type: 'reverse',
            action: { type: 'custom', config: { handler: 'undo' } },
          },
        },
      ],
    };

    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
  });

  test('should validate workflow-level compensation', () => {
    const definition = {
      workflowId: 'test-wf',
      name: 'Test',
      steps: [{ name: 's1', action: { type: 'message', config: { to: '+1', message: 'hi' } } }],
      compensation: {
        type: 'parallel',
        steps: [
          { name: 'comp1', action: { type: 'custom', config: { handler: 'cleanup' } } },
        ],
      },
    };

    expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow();
  });

  test('should validate retry policy constraints', () => {
    const validPolicy = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      jitterFactor: 0.15,
    };

    expect(() => workflowDefinitionSchema.parse({
      workflowId: 'test',
      name: 'Test',
      steps: [{ name: 's', action: { type: 'delay', config: { delayMs: 1000 } } }],
      retryPolicy: validPolicy,
    })).not.toThrow();

    // Invalid jitterFactor > 1
    expect(() => workflowDefinitionSchema.parse({
      workflowId: 'test',
      name: 'Test',
      steps: [{ name: 's', action: { type: 'delay', config: { delayMs: 1000 } } }],
      retryPolicy: { ...validPolicy, jitterFactor: 1.5 },
    })).toThrow();
  });
});

// ============================================================================
// End-to-End Processor Tests
// ============================================================================

describe('Workflow Processor', () => {
  let processWorkflowStep: (job: any) => Promise<void>;

  beforeAll(async () => {
    const module = await import('../lib/workflow-orchestration/processor');
    processWorkflowStep = module.processWorkflowStep;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should handle message action successfully', async () => {
    mockMessageQueue.add.mockResolvedValue({ id: 'msg-job-123' } as any);
    mockPrisma.workflowInstance.findUnique.mockResolvedValue({
      id: 'inst_123',
      instanceId: 'wf_inst_123',
      definitionId: 'def_123',
      status: 'RUNNING',
      orgId: 'org-123',
    });
    mockPrisma.workflowDefinition.findUnique.mockResolvedValue({
      id: 'def_123',
      steps: [{ name: 'send-msg', action: { type: 'message', config: { to: '+1', message: 'hi' } } }],
    });
    mockPrisma.workflowStepHistory.create.mockResolvedValue({} as any);
    mockPrisma.workflowStepHistory.updateMany.mockResolvedValue({ count: 1 });

    const mockJob = {
      id: 'job-123',
      data: {
        instanceId: 'wf_inst_123',
        workflowId: 'test-wf',
        stepIndex: 0,
        stepName: 'send-msg',
        action: {
          type: 'message',
          config: { to: '+1', message: 'hi' },
        },
        orgId: 'org-123',
        context: {},
        retryPolicy: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0.1 },
      },
      attemptsMade: 0,
    };

    await processWorkflowStep(mockJob);

    expect(mockPrisma.workflowStepHistory.create).toHaveBeenCalled();
    expect(mockPrisma.workflowStepHistory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instanceId: 'wf_inst_123', stepIndex: 0, status: 'RUNNING' },
        data: { status: 'COMPLETED', completedAt: expect.any(Date), outputJson: { jobId: 'msg-job-123', messageQueued: true } },
      })
    );
    expect(mockSocketService.broadcastToOrg).toHaveBeenCalled();
  });

  test('should retry on transient failure', async () => {
    mockPrisma.workflowInstance.findUnique.mockResolvedValue({
      id: 'inst_123',
      instanceId: 'wf_inst_123',
      definitionId: 'def_123',
      status: 'RUNNING',
      orgId: 'org-123',
    });
    mockPrisma.workflowDefinition.findUnique.mockResolvedValue({
      id: 'def_123',
      steps: [{ name: 'api-call', action: { type: 'api-call', config: { url: 'https://api.test' } } }],
    });
    mockPrisma.workflowStepHistory.create.mockResolvedValue({} as any);
    mockPrisma.workflowStepHistory.updateMany.mockResolvedValue({ count: 1 });

    const mockJob = {
      id: 'job-123',
      data: {
        instanceId: 'wf_inst_123',
        workflowId: 'test-wf',
        stepIndex: 0,
        stepName: 'api-call',
        action: {
          type: 'api-call',
          config: { url: 'https://api.test/fail' },
        },
        orgId: 'org-123',
        context: {},
        retryPolicy: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 },
      },
      attemptsMade: 0,
    };

    // Simulate API returning 503 (transient error)
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve(''),
      })
    ) as any;

    const error = await processWorkflowStep(mockJob).catch(e => e);

    expect(error.message).toContain('Step failed temporarily');
    expect((error as any).retryIn).toBeDefined();
    expect(mockSocketService.broadcastToOrg).not.toHaveBeenCalledWith(
      'org-123',
      'workflow:step:failed',
      expect.objectContaining({ final: true })
    );
  });

  test('should fail workflow on permanent error', async () => {
    mockPrisma.workflowInstance.findUnique.mockResolvedValue({
      id: 'inst_123',
      instanceId: 'wf_inst_123',
      definitionId: 'def_123',
      status: 'RUNNING',
      orgId: 'org-123',
    });
    mockPrisma.workflowDefinition.findUnique.mockResolvedValue({
      id: 'def_123',
      steps: [{ name: 'api-call', action: { type: 'api-call', config: { url: 'https://api.test' } } }],
    });
    mockPrisma.workflowStepHistory.create.mockResolvedValue({} as any);
    mockPrisma.workflowStepHistory.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.workflowInstance.update.mockResolvedValue({} as any);

    const mockJob = {
      id: 'job-123',
      data: {
        instanceId: 'wf_inst_123',
        workflowId: 'test-wf',
        stepIndex: 0,
        stepName: 'api-call',
        action: {
          type: 'api-call',
          config: { url: 'https://api.test/not-found' },
        },
        orgId: 'org-123',
        context: {},
        retryPolicy: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 },
      },
      attemptsMade: 0,
    };

    // Simulate 404 (permanent error)
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not found'),
      })
    ) as any;

    await expect(processWorkflowStep(mockJob)).rejects.toThrow('Step failed permanently');

    expect(mockPrisma.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'FAILED', failureReason: expect.any(String) },
      })
    );
    expect(mockSocketService.broadcastToOrg).toHaveBeenCalledWith(
      'org-123',
      'workflow:step:failed',
      expect.objectContaining({ final: true })
    );
  });

  test('should handle delay action', async () => {
    mockPrisma.workflowInstance.findUnique.mockResolvedValue({
      id: 'inst_123',
      instanceId: 'wf_inst_123',
      definitionId: 'def_123',
      status: 'RUNNING',
      orgId: 'org-123',
    });
    mockPrisma.workflowDefinition.findUnique.mockResolvedValue({
      id: 'def_123',
      steps: [{ name: 'wait', action: { type: 'delay', config: { delayMs: 100 } } }],
    });
    mockPrisma.workflowStepHistory.create.mockResolvedValue({} as any);
    mockPrisma.workflowStepHistory.updateMany.mockResolvedValue({ count: 1 });

    const mockJob = {
      id: 'job-123',
      data: {
        instanceId: 'wf_inst_123',
        workflowId: 'test-wf',
        stepIndex: 0,
        stepName: 'wait',
        action: {
          type: 'delay',
          config: { delayMs: 50 },
        },
        orgId: 'org-123',
        context: {},
        retryPolicy: { maxAttempts: 1, baseDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 },
      },
      attemptsMade: 0,
    };

    const start = Date.now();
    await processWorkflowStep(mockJob);
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(50);
    expect(mockSocketService.broadcastToOrg).toHaveBeenCalledWith(
      'org-123',
      'workflow:step:completed',
      expect.objectContaining({
        duration: expect.any(Number),
      })
    );
  });

  test('should skip step if instance is not RUNNING', async () => {
    mockPrisma.workflowInstance.findUnique.mockResolvedValue({
      id: 'inst_123',
      instanceId: 'wf_inst_123',
      definitionId: 'def_123',
      status: 'CANCELLED', // Not RUNNING
      orgId: 'org-123',
    });

    const mockJob = {
      id: 'job-123',
      data: {
        instanceId: 'wf_inst_123',
        workflowId: 'test-wf',
        stepIndex: 0,
        stepName: 'skip-me',
        action: { type: 'message', config: { to: '+1', message: 'hi' } },
        orgId: 'org-123',
        context: {},
      },
      attemptsMade: 0,
    };

    await processWorkflowStep(mockJob);

    // Should return early without executing step
    expect(mockPrisma.workflowStepHistory.create).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Queue Job Action Tests
// ============================================================================

describe('Queue Job Action', () => {
  test('should add job to message queue', async () => {
    const { executeQueueJobAction } = await import('../lib/workflow-orchestration/processor');
    mockMessageQueue.add.mockResolvedValue({ id: 'queue-job-123' } as any);

    const result = await executeQueueJobAction({
      jobType: 'ANALYTICS_EVENT',
      payload: { event: 'test', data: {} },
    }, {
      instanceId: 'wf_123',
      workflowId: 'test',
      stepIndex: 0,
      stepName: 'queue',
      context: {},
      orgId: 'org-123',
      executionCount: 0,
    } as any);

    expect(result.success).toBe(true);
    expect(result.output.jobId).toBe('queue-job-123');
    expect(mockMessageQueue.add).toHaveBeenCalledWith(
      'ANALYTICS_EVENT',
      expect.objectContaining({ event: 'test' }),
      expect.any(Object)
    );
  });

  test('should handle invalid jobType gracefully', async () => {
    const { executeQueueJobAction } = await import('../lib/workflow-orchestration/processor');

    const result = await executeQueueJobAction({
      jobType: 'INVALID_TYPE',
      payload: {},
    }, {
      instanceId: 'wf_123',
      workflowId: 'test',
      stepIndex: 0,
      stepName: 'queue',
      context: {},
      orgId: 'org-123',
      executionCount: 0,
    } as any);

    expect(result.success).toBe(true);
    expect(result.output.jobType).toBe('ANALYTICS_EVENT'); // Falls back to ANALYTICS_EVENT
  });
});

// ============================================================================
// Custom Action Tests
// ============================================================================

describe('Custom Action', () => {
  test('should execute custom handler', async () => {
    const { executeCustomAction } = await import('../lib/workflow-orchestration/processor');

    const result = await executeCustomAction({
      handler: 'my-custom-handler',
      params: { key: 'value' },
    }, {
      instanceId: 'wf_123',
      workflowId: 'test',
      stepIndex: 0,
      stepName: 'custom',
      context: {},
      orgId: 'org-123',
      executionCount: 0,
    } as any);

    expect(result.success).toBe(true);
    expect(result.output.handler).toBe('my-custom-handler');
    expect(result.output.executed).toBe(true);
  });

  test('should work with empty params', async () => {
    const { executeCustomAction } = await import('../lib/workflow-orchestration/processor');

    const result = await executeCustomAction({
      handler: 'handler1',
    }, {
      instanceId: 'wf_123',
      workflowId: 'test',
      stepIndex: 0,
      stepName: 'custom',
      context: {},
      orgId: 'org-123',
      executionCount: 0,
    } as any);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Integration-like Unit Tests (mocked external dependencies)
// ============================================================================

describe('Workflow Health Check', () => {
  let checkWorkflowHealth: (instanceId: string, timeoutMs?: number) => Promise<any>;

  beforeAll(async () => {
    const module = await import('../lib/workflow-orchestration/engine');
    checkWorkflowHealth = module.checkWorkflowHealth;
  });

  test('should report healthy if instance exists and recent heartbeat', async () => {
    const mockInstance = {
      id: 'inst_123',
      instanceId: 'wf_inst_123',
      status: 'RUNNING',
      lastHeartbeatAt: new Date(),
    };

    mockPrisma.workflowInstance.findUnique.mockResolvedValue(mockInstance as any);

    const health = await checkWorkflowHealth('wf_inst_123');

    expect(health.healthy).toBe(true);
    expect(health.status).toBe('RUNNING');
  });

  test('should report unhealthy if no recent heartbeat', async () => {
    const mockInstance = {
      id: 'inst_123',
      instanceId: 'wf_inst_123',
      status: 'RUNNING',
      lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    };

    mockPrisma.workflowInstance.findUnique.mockResolvedValue(mockInstance as any);

    const health = await checkWorkflowHealth('wf_inst_123');

    expect(health.healthy).toBe(false);
    expect(health.reason).toContain('stale');
  });

  test('should report unhealthy if instance not found', async () => {
    mockPrisma.workflowInstance.findUnique.mockResolvedValue(null);

    const health = await checkWorkflowHealth('nonexistent');

    expect(health.healthy).toBe(false);
    expect(health.reason).toBe('not_found');
  });
});
