/**
 * Workflow Orchestration - Type Definitions
 * Phase 3 Step 3: Async Flow Orchestration
 */

import type { Job } from 'bullmq';

// ============================================================================
// Workflow Definition Types
// ============================================================================

/**
 * Configuration for a single step in a workflow
 */
export interface WorkflowStep {
  /** Unique step identifier (within this workflow) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Action to execute - could be a built-in type or custom handler */
  action: {
    type: 'message' | 'api-call' | 'custom' | 'queue-job' | 'delay' | 'parallel';
    config: Record<string, unknown>;
  };
  /** Priority for this step (affects queue priority) */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Timeout for this step in milliseconds */
  timeoutMs?: number;
  /** Retry policy override for this step */
  retryPolicy?: RetryPolicy;
  /** Compensation action for this step (executed on failure) */
  compensation?: {
    type: 'reverse' | 'custom';
    action: { type: string; config: Record<string, unknown> };
  };
  /** Whether this step can be skipped if previous step failed */
  optional?: boolean;
  /** Conditional expression to determine if step should run */
  condition?: {
    expression: string; // e.g., "context.data.type === 'marketing'"
  };
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

/**
 * Complete workflow definition stored in database
 */
export interface WorkflowDefinition {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  version: number;
  steps: WorkflowStep[];
  compensation?: {
    type: 'sequential' | 'parallel';
    steps: WorkflowStep[];
  };
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parsed step configuration with runtime metadata
 */
export interface ParsedStep extends WorkflowStep {
  index: number;
  workflowId: string;
}

// ============================================================================
// Workflow Instance Types
// ============================================================================

/**
 * Runtime state of a workflow execution
 */
export interface WorkflowInstance {
  id: string;
  instanceId: string;
  definitionId: string;
  status: WorkflowStatus;
  currentStep: number | null;
  context: Record<string, unknown>;
  startedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  lastHeartbeatAt?: Date;
  orgId: string;
  // runtime fields (not stored)
  definition?: WorkflowDefinition;
  stepsHistory?: WorkflowStepHistory[]; // populated when loading from DB
}

/**
 * History of a single step execution
 */
export interface WorkflowStepHistory {
  id: string;
  instanceId: string;
  stepIndex: number;
  stepName?: string;
  status: WorkflowStepStatus;
  startedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  inputJson?: any;  // Prisma Json type
  outputJson?: any; // Prisma Json type
  metadata?: any;   // Prisma Json type
}

// ============================================================================
// Workflow Engine Types
// ============================================================================

/**
 * Options for starting a workflow
 */
export interface StartWorkflowOptions {
  /** Optional: override default retry policy */
  retryPolicy?: RetryPolicy;
  /** Optional: override default timeout */
  timeoutMs?: number;
  /** Optional: custom context (merged with definition's initial context if provided) */
  context?: Record<string, unknown>;
  /** Optional: parent workflow instance ID (for nested workflows) */
  parentInstanceId?: string;
}

/**
 * Result of starting a workflow
 */
export interface StartWorkflowResult {
  instanceId: string;
  status: WorkflowStatus;
  firstStepIndex: number;
  message: string;
}

/**
 * Context passed to step processors
 */
export interface StepExecutionContext {
  instanceId: string;
  workflowId: string;
  stepIndex: number;
  stepName: string;
  context: Record<string, unknown>;
  orgId: string;
  executionCount: number;
}

/**
 * Result of a step execution
 */
export interface StepExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  shouldCompensate?: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Compensation Types
// ============================================================================

/**
 * Compensation action definition
 */
export interface CompensationAction {
  type: 'reverse' | 'custom';
  stepIndex?: number; // for 'reverse': which step to compensate
  action: {
    type: string;
    config: Record<string, unknown>;
  };
}

// ============================================================================
// Queue & Job Types
// ============================================================================

/**
 * BullMQ job data for workflow step execution
 */
export interface WorkflowStepJobData {
  type: 'WORKFLOW_STEP';
  instanceId: string;
  workflowId: string;
  stepIndex: number;
  stepName: string;
  context: Record<string, unknown>;
  orgId: string;
  executionCount: number;
  action: { type: string; config: Record<string, unknown> };
  retryPolicy?: RetryPolicy;
  parentJobId?: string;
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Metrics labels for workflow orchestration
 */
export interface WorkflowMetricLabels {
  workflow_id: string;
  org_id: string;
  step_name?: string;
  status?: string;
  error_category?: string;
  trigger_reason?: string;
}

// ============================================================================
// Admin API Types
// ============================================================================

/**
 * Query parameters for listing workflow definitions
 */
export interface ListDefinitionsQuery {
  limit?: number;
  offset?: number;
  isActive?: boolean;
  search?: string;
}

/**
 * Query parameters for listing workflow instances
 */
export interface ListInstancesQuery {
  limit?: number;
  offset?: string;
  definitionId?: string;
  status?: WorkflowStatus;
  orgId?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Workflow instance details with step history
 */
export interface WorkflowInstanceDetails extends WorkflowInstance {
  stepsHistory: WorkflowStepHistory[];
  definitionName?: string;
}

// ============================================================================
// Enums
// ============================================================================

/**
 * Overall status of a workflow instance
 */
export enum WorkflowStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED'
}

/**
 * Status of an individual workflow step
 */
export enum WorkflowStepStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
  COMPENSATED = 'COMPENSATED'
}

/**
 * Reasons for compensation trigger
 */
export enum CompensationTriggerReason {
  STEP_FAILED = 'step_failed',
  WORKFLOW_TIMEOUT = 'workflow_timeout',
  MANUAL = 'manual',
  PARENT_FAILED = 'parent_failed'
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Partial result from workflow operations
 */
export interface WorkflowOperationResult {
  success: boolean;
  instanceId?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Health check status for a workflow instance
 */
export interface WorkflowHealthStatus {
  instanceId: string;
  isHealthy: boolean;
  issues: string[];
  currentStep?: number;
  status: WorkflowStatus;
  lastUpdate: Date;
  estimatedCompletion?: Date;
}

/**
 * Metrics summary for a workflow definition
 */
export interface WorkflowMetricsSummary {
  workflowId: string;
  totalInstances: number;
  instancesByStatus: Record<string, number>;
  avgDurationSeconds: number;
  successRate: number;
  stepFailureCount: Record<string, number>;
  compensationCount: number;
}
