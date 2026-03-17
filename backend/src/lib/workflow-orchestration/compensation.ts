/**
 * Workflow Compensation Engine
 * Handles rollback and compensation actions when workflow steps fail
 */

import { prisma } from '../prisma';
import type {
  WorkflowInstance,
  WorkflowStepHistory,
  WorkflowStep,
  CompensationAction,
  StepExecutionContext,
  StepExecutionResult,
  CompensationTriggerReason
} from './types';

// ============================================================================
// Main Compensation Functions
// ============================================================================

/**
 * Execute compensation for a failed workflow
 *
 * This function:
 * 1. Loads the workflow instance and step history
 * 2. Determines which steps need compensation
 * 3. Executes compensation actions in reverse order
 * 4. Records compensation in step history
 * 5. Updates workflow instance status
 *
 * @param instanceId - Workflow instance ID
 * @param reason - Why compensation is being triggered
 * @param failedStepIndex - Index of step that failed (optional, for partial compensation)
 * @returns Promise resolving to compensation result
 */
export async function compensateWorkflow(
  instanceId: string,
  reason: CompensationTriggerReason,
  failedStepIndex?: number
): Promise<{
  success: boolean;
  compensatedSteps: number;
  errors: Array<{ stepIndex: number; error: string }>;
}> {
  console.log(`[Compensation] Starting compensation for instance ${instanceId}, reason: ${reason}`);

  // Load instance with definition and history
  const instance = await loadWorkflowInstance(instanceId);
  if (!instance) {
    throw new Error(`Workflow instance ${instanceId} not found`);
  }

  // Ensure instance is in a compensatable state
  if (!isCompensatable(instance.status)) {
    throw new Error(`Workflow instance ${instanceId} is not compensatable (status: ${instance.status})`);
  }

  // Determine which steps to compensate
  const stepsToCompensate = determineStepsToCompensate(instance, failedStepIndex);
  if (stepsToCompensate.length === 0) {
    console.log(`[Compensation] No steps to compensate for instance ${instanceId}`);
    return { success: true, compensatedSteps: 0, errors: [] };
  }

  // Execute compensations
  const results: Array<{ stepIndex: number; success: boolean; error?: string }> = [];
  const orgId = instance.orgId;

  for (const stepIndex of stepsToCompensate) {
    try {
      const stepHistory = instance.stepsHistory.find(h => h.stepIndex === stepIndex);
      const step = instance.definition.steps[stepIndex];

      if (!step.compensation) {
        console.log(`[Compensation] Step ${stepIndex} has no compensation, skipping`);
        results.push({ stepIndex, success: true });
        continue;
      }

      console.log(`[Compensation] Executing compensation for step ${stepIndex} (${step.name})`);

      // Build execution context for compensation
      const context: StepExecutionContext = {
        instanceId,
        workflowId: instance.definition.workflowId,
        stepIndex,
        stepName: step.name,
        context: instance.context,
        orgId,
        executionCount: stepHistory?.retryCount ?? 0
      };

      // Execute compensation action
      await executeCompensationAction(step.compensation, context, instance.context);

      // Record compensation in history
      await recordCompensation(instanceId, stepIndex, step.name, context);

      results.push({ stepIndex, success: true });
      console.log(`[Compensation] Step ${stepIndex} compensated successfully`);
    } catch (error: any) {
      console.error(`[Compensation] Step ${stepIndex} compensation failed:`, error);
      results.push({ stepIndex, success: false, error: error.message });
    }
  }

  // Update instance status
  const allSucceeded = results.every(r => r.success);
  const errors = results.filter(r => !r.success).map(r => ({ stepIndex: r.stepIndex, error: r.error! }));

  await updateInstanceCompensationStatus(instanceId, allSucceeded, errors);

  return {
    success: allSucceeded,
    compensatedSteps: results.filter(r => r.success).length,
    errors
  };
}

/**
 * Determine which steps need compensation
 *
 * Strategy: Compensate in reverse order from the failure point or all executed steps
 *
 * @param instance - Workflow instance
 * @param failedStepIndex - Index of step that failed (triggers compensation of prior steps)
 * @returns Array of step indices to compensate (in reverse order)
 */
function determineStepsToCompensate(
  instance: WorkflowInstance,
  failedStepIndex?: number
): number[] {
  // Get successfully completed steps (excluding skipped)
  const completedSteps = instance.stepsHistory
    .filter(h => h.status === 'COMPLETED')
    .map(h => h.stepIndex)
    .sort((a, b) => b - a); // Descending (latest first)

  if (failedStepIndex !== undefined) {
    // Compensate steps that completed before the failed step
    return completedSteps.filter(idx => idx < failedStepIndex);
  }

  // Compensate all completed steps (reverse order)
  return completedSteps;
}

/**
 * Execute a single compensation action
 *
 * @param action - Compensation action configuration
 * @param context - Step execution context
 * @param workflowContext - Current workflow context (will be modified)
 */
async function executeCompensationAction(
  action: CompensationAction,
  context: StepExecutionContext,
  workflowContext: Record<string, unknown>
): Promise<void> {
  const { type, action: actionConfig } = action;

  if (type === 'reverse') {
    // For 'reverse', we may need to execute a custom action
    // The actual reversal logic depends on what the step did
    console.log(`[Compensation] Reverse action: ${actionConfig.type}`);
    await executeCustomAction(actionConfig, context, workflowContext);
  } else if (type === 'custom') {
    await executeCustomAction(actionConfig, context, workflowContext);
  } else {
    throw new Error(`Unknown compensation type: ${type}`);
  }
}

/**
 * Execute a custom compensation action
 *
 * This is a pluggable point where specific compensation logic can be added:
 * - Delete created records
 * - Restore previous state
 * - Send notification of rollback
 * - Call external APIs to reverse effects
 */
async function executeCustomAction(
  actionConfig: { type: string; config: Record<string, unknown> },
  context: StepExecutionContext,
  workflowContext: Record<string, unknown>
): Promise<void> {
  const { type, config } = actionConfig;

  switch (type) {
    case 'delete-message':
      // Example: Delete a message that was sent
      await deleteMessage(config.messageId as string);
      break;

    case 'restore-state':
      // Example: Restore previous value in database
      await restoreState(config.table as string, config.id as string, config.previousState as Record<string, unknown>);
      break;

    case 'send-notification':
      // Example: Send notification that compensation occurred
      await sendCompensationNotification(context, config);
      break;

    case 'update-context':
      // Update workflow context to reflect compensation
      Object.assign(workflowContext, config.updates);
      break;

    default:
      console.warn(`[Compensation] Unknown custom action type: ${type}`);
      // For extensibility, custom handlers could be registered
      throw new Error(`Unknown custom action type: ${type}`);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load workflow instance with definition and history
 */
async function loadWorkflowInstance(instanceId: string): Promise<WorkflowInstance | null> {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: {
      definition: true,
      stepsHistory: {
        orderBy: { stepIndex: 'asc' }
      }
    }
  });

  if (!instance) return null;

  return {
    ...instance,
    status: instance.status as any,
    context: instance.contextJson as Record<string, unknown>,
    definition: {
      ...instance.definition,
      steps: instance.definition.stepsJson as any[],
      compensation: instance.definition.compensationJson as any | undefined
    },
    stepsHistory: instance.stepsHistory.map(h => ({
      ...h,
      status: h.status as any,
      input: h.inputJson as Record<string, unknown> | undefined,
      output: h.outputJson as Record<string, unknown> | undefined,
      metadata: h.metadata as Record<string, unknown> | undefined
    }))
  };
}

/**
 * Check if instance status allows compensation
 */
function isCompensatable(status: string): boolean {
  const compensatable = [
    'FAILED',
    'RUNNING',
    'COMPENSATING'
  ];
  return compensatable.includes(status);
}

/**
 * Record a compensation event in step history
 */
async function recordCompensation(
  instanceId: string,
  stepIndex: number,
  stepName: string,
  context: StepExecutionContext
): Promise<void> {
  await prisma.workflowStepHistory.create({
    data: {
      instanceId,
      stepIndex,
      stepName,
      status: 'COMPENSATED',
      startedAt: new Date(),
      completedAt: new Date(),
      inputJson: {
        stepIndex,
        stepName,
        context: context.context as any,
        reason: 'compensation'
      } as any,
      outputJson: { compensated: true } as any,
      metadata: {
        compensation: true,
        triggeredBy: context.orgId
      } as any
    }
  });
}

/**
 * Update workflow instance status after compensation
 */
async function updateInstanceCompensationStatus(
  instanceId: string,
  allSucceeded: boolean,
  errors: Array<{ stepIndex: number; error: string }>
): Promise<void> {
  const status = allSucceeded ? 'COMPENSATED' : 'FAILED';
  const failureReason = allSucceeded ? undefined : `Compensation failed: ${errors.map(e => `Step ${e.stepIndex}: ${e.error}`).join('; ')}`;

  await prisma.workflowInstance.update({
    where: { id: instanceId },
    data: {
      status,
      failedAt: allSucceeded ? null : new Date(),
      failureReason
    }
  });

  console.log(`[Compensation] Instance ${instanceId} compensation completed with status: ${status}`);
}

// ============================================================================
// Placeholder Actions (to be implemented with actual integrations)
// ============================================================================

async function deleteMessage(messageId: string): Promise<void> {
  // TODO: Integrate with message deletion system
  console.log(`[Compensation] Would delete message: ${messageId}`);
}

async function restoreState(table: string, id: string, previousState: Record<string, unknown>): Promise<void> {
  // TODO: Integrate with database restore logic
  console.log(`[Compensation] Would restore ${table}:${id} to previous state`, previousState);
}

async function sendCompensationNotification(
  context: StepExecutionContext,
  config: Record<string, unknown>
): Promise<void> {
  // TODO: Integrate with notification system
  console.log(`[Compensation] Would send notification for instance ${context.instanceId}`, config);
}
