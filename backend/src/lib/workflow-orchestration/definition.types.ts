/**
 * Workflow Orchestration - Definition Types
 * Types for workflow definition and step configuration
 */

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
  compensation?: CompensationAction;
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
