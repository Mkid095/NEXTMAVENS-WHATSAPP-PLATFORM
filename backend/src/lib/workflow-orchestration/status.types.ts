/**
 * Workflow Orchestration - Status Enums
 */

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
