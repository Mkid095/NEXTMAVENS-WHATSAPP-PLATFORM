/**
 * Workflow Orchestration - Instance Types
 * Types for workflow runtime instances and step history
 */

import type { WorkflowDefinition } from './definition.types';

/**
 * Runtime state of a workflow execution
 */
export interface WorkflowInstance {
  id: string;
  instanceId: string;
  definitionId: string;
  status: import('./status.types').WorkflowStatus;
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
  status: import('./status.types').WorkflowStepStatus;
  startedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  inputJson?: any;  // Prisma Json type
  outputJson?: any; // Prisma Json type
  metadata?: any;   // Prisma Json type
}

/**
 * Workflow instance details with step history
 */
export interface WorkflowInstanceDetails extends WorkflowInstance {
  stepsHistory: WorkflowStepHistory[];
  definitionName?: string;
}
