/**
 * Workflow Orchestration - Common Types
 * Shared utility types
 */

import type { WorkflowStatus } from './status.types';

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
