/**
 * Workflow Compensation - Service
 * Main compensation engine and business logic
 */

import type { WorkflowInstance, CompensationTriggerReason, StepExecutionContext } from './types';
import { loadWorkflowInstance, recordCompensation, isCompensatable, updateInstanceCompensationStatus } from './compensation.loader';
import { executeCompensationAction } from './compensation.executor';

/**
 * Execute compensation for a failed workflow
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

  const instance = await loadWorkflowInstance(instanceId);
  if (!instance) {
    throw new Error(`Workflow instance ${instanceId} not found`);
  }

  if (!isCompensatable(instance.status)) {
    throw new Error(`Workflow instance ${instanceId} is not compensatable (status: ${instance.status})`);
  }

  const stepsToCompensate = determineStepsToCompensate(instance, failedStepIndex);
  if (stepsToCompensate.length === 0) {
    console.log(`[Compensation] No steps to compensate for instance ${instanceId}`);
    return { success: true, compensatedSteps: 0, errors: [] };
  }

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

      const context: StepExecutionContext = {
        instanceId,
        workflowId: instance.definition.workflowId,
        stepIndex,
        stepName: step.name,
        context: instance.context,
        orgId,
        executionCount: stepHistory?.retryCount ?? 0
      };

      await executeCompensationAction(step.compensation, context, instance.context);
      await recordCompensation(instanceId, stepIndex, step.name, context);

      results.push({ stepIndex, success: true });
      console.log(`[Compensation] Step ${stepIndex} compensated successfully`);
    } catch (error: any) {
      console.error(`[Compensation] Step ${stepIndex} compensation failed:`, error);
      results.push({ stepIndex, success: false, error: error.message });
    }
  }

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
 */
function determineStepsToCompensate(
  instance: WorkflowInstance,
  failedStepIndex?: number
): number[] {
  const completedSteps = instance.stepsHistory
    .filter(h => h.status === 'COMPLETED')
    .map(h => h.stepIndex)
    .sort((a, b) => b - a); // Descending (latest first)

  if (failedStepIndex !== undefined) {
    return completedSteps.filter(idx => idx < failedStepIndex);
  }

  return completedSteps;
}
