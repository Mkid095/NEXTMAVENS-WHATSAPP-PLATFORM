/**
 * Workflow Orchestration - Execution Types
 * Types for workflow execution, step processing, and job data
 */

import type { RetryPolicy } from './definition.types';

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
  status: import('./status.types').WorkflowStatus;
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
