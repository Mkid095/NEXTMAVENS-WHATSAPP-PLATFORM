/**
 * Workflow Queue Integration
 * Enqueues workflow step jobs to the main BullMQ queue
 */

import { MessagePriority } from '../message-queue-priority-system/types';
import { messageQueue, getQueueMetrics } from '../message-queue-priority-system';
import type { WorkflowStepJobData } from './types';

// ============================================================================
// Queue Constants
// ============================================================================

export const WORKFLOW_STEP_JOB_TYPE = 'WORKFLOW_STEP';
export const WORKFLOW_QUEUE_PRIORITY: 'low' | 'normal' | 'high' | 'critical' = 'normal';

// ============================================================================
// Enqueue Functions
// ============================================================================

/**
 * Enqueue a workflow step job
 *
 * @param data - Job data containing instance and step info
 * @param options - Optional job options (priority, delay, parent job)
 * @returns The added job
 */
export async function enqueueWorkflowStep(
  data: WorkflowStepJobData,
  options: {
    priority?: 'low' | 'normal' | 'high' | 'critical';
    delayMs?: number;
    parentJobId?: string;
  } = {}
): Promise<import('bullmq').Job> {
  const priority = mapPriority(options.priority ?? WORKFLOW_QUEUE_PRIORITY);
  const delay = options.delayMs ?? 0;

  // Build BullMQ job options
  const jobOptions: Record<string, unknown> = {
    priority,
    ...(delay > 0 && { delay }),
    ...(options.parentJobId && { parent: options.parentJobId })
  };

  // Add to queue
  const job = await messageQueue.add(
    WORKFLOW_STEP_JOB_TYPE,
    data,
    jobOptions
  );

  return job;
}

/**
 * Map our priority levels to BullMQ numeric priority (-3 to 3)
 */
function mapPriority(priority: 'low' | 'normal' | 'high' | 'critical'): number {
  const priorityMap: Record<string, number> = {
    'low': -1,
    'normal': 0,
    'high': 2,
    'critical': 3
  };
  return priorityMap[priority] ?? 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique workflow instance ID
 */
export function generateInstanceId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Generate a step-level deduplication ID to prevent duplicate step execution
 * Useful for idempotent steps
 */
export function generateStepDeduplicationId(instanceId: string, stepIndex: number): string {
  return `${instanceId}:step:${stepIndex}`;
}

// ============================================================================
// Queue Status
// ============================================================================

/**
 * Get workflow-specific queue metrics
 * Note: This is a stub implementation; returns zeros until properly implemented with job filtering.
 */
export async function getWorkflowQueueMetrics() {
  // TODO: Implement by scanning jobs with name === WORKFLOW_STEP_JOB_TYPE
  return {
    totalWorkflowSteps: 0,
    activeWorkflowSteps: 0,
    completedWorkflowSteps: 0,
    failedWorkflowSteps: 0,
    delayedWorkflowSteps: 0
  };
}
