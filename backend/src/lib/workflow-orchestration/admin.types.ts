/**
 * Workflow Orchestration - Admin API Types
 * Types for admin-facing queries and metrics
 */

import type { WorkflowStatus } from './status.types';

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
