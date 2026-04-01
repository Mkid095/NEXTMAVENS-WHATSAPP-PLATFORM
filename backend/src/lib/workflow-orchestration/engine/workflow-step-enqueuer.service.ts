/**
 * Workflow Step Enqueuer Service
 *
 * Handles enqueuing workflow steps to the message queue and related utilities.
 */

import { enqueueWorkflowStep } from '../queue';
import type { WorkflowStepJobData, WorkflowStatus } from '../types';
import { getStepTypeFromAction, resolveRetryPolicy } from '../retry-resolver';
import { updateInstanceStatus } from './workflow-persistence.repository';
import { recordStepSkipped as persistRecordStepSkipped } from './workflow-persistence.repository';

/**
 * Map our step priority levels to BullMQ numeric priority (-3 to 3)
 */
function mapStepPriority(
  priority?: 'low' | 'normal' | 'high' | 'critical'
): 'low' | 'normal' | 'high' | 'critical' {
  // Simple pass-through; enqueueWorkflowStep will map further
  return priority ?? 'normal';
}

/**
 * Enqueue a workflow step job
 *
 * Prepares job data and adds it to the message queue with appropriate priority and retry policy.
 */
export async function enqueueStep(
  instanceDbId: string,
  instanceId: string,
  definition: any, // WorkflowDefinition
  step: any, // WorkflowStep
  stepIndex: number,
  context: Record<string, unknown>,
  options: any = {}
): Promise<void> {
  const stepType = getStepTypeFromAction(step.action);
  const retryPolicy = resolveRetryPolicy(
    stepType,
    step.retryPolicy,
    options.retryPolicy ?? definition.retryPolicy
  );

  const jobData: WorkflowStepJobData = {
    type: 'WORKFLOW_STEP',
    instanceId: instanceDbId,
    workflowId: definition.workflowId,
    stepIndex,
    stepName: step.name,
    context,
    orgId: (context as any).orgId || 'unknown',
    executionCount: 0,
    action: step.action,
    retryPolicy
  };

  await enqueueWorkflowStep(jobData, {
    priority: mapStepPriority(step.priority),
    delayMs: step.action.type === 'delay' ? (step.action.config.delayMs as number) : undefined
  });

  console.log(`[WorkflowEngine] Enqueued step ${stepIndex} (${step.name}) for instance ${instanceId}`);
}

/**
 * Transition an instance to a new status with logging
 */
export async function transitionInstanceStatus(
  instanceId: string,
  status: WorkflowStatus,
  reason?: string
): Promise<void> {
  await updateInstanceStatus(instanceId, status);
  console.log(`[WorkflowEngine] Instance ${instanceId} status -> ${status}${reason ? ` (${reason})` : ''}`);
}

/**
 * Record that a step was skipped (condition not met)
 */
export async function recordStepSkipped(
  instanceId: string,
  stepIndex: number,
  stepName: string
): Promise<void> {
  await persistRecordStepSkipped(instanceId, stepIndex, stepName);
}

/**
 * Evaluate a condition expression against the workflow context
 *
 * WARNING: Using Function constructor can be dangerous if the expression comes from untrusted source.
 * In production, consider using a safe expression evaluator like 'filtrex' or 'jsep'.
 */
export async function evaluateCondition(
  condition: { expression: string },
  context: Record<string, unknown>
): Promise<boolean> {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('ctx', `return ${condition.expression}`);
    return fn(context);
  } catch (error) {
    console.error(`[WorkflowEngine] Condition evaluation error:`, error);
    return false;
  }
}
