/**
 * Workflow Engine - Advancer Operations
 *
 * Handles advancing workflow instances to the next step.
 */

import type { StepExecutionContext, StepExecutionResult, WorkflowOperationResult } from '../../types';
import {
  loadInstance,
  completeWorkflow as persistCompleteWorkflow,
  setCurrentStep
} from '../workflow-persistence.repository';
import {
  transitionInstanceStatus,
  recordStepSkipped,
  evaluateCondition,
  enqueueStep
} from '../workflow-step-enqueuer.service';

/**
 * Advance workflow to next step (called after step success)
 */
export async function advanceStep(
  instanceId: string,
  stepResult?: StepExecutionResult
): Promise<WorkflowOperationResult> {
  console.log(`[WorkflowEngine] Advancing instance ${instanceId}`);

  const instance = await loadInstance(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  // Validate instance is in RUNNING state
  if (instance.status !== 'RUNNING') {
    return { success: false, error: `Instance not in RUNNING state (current: ${instance.status})` };
  }

  const currentStepIndex = instance.currentStep ?? 0;
  const definition = instance.definition;
  const nextStepIndex = currentStepIndex + 1;

  // Check if there are more steps
  if (nextStepIndex >= definition.steps.length) {
    // Workflow completed successfully
    await persistCompleteWorkflow(instance.id);
    return { success: true, instanceId, details: { reason: 'All steps completed' } };
  }

  // Get next step
  const nextStep = definition.steps[nextStepIndex];

  // Check if step is optional and condition not met
  if (nextStep.optional && nextStep.condition) {
    const shouldSkip = await evaluateCondition(nextStep.condition, instance.context);
    if (!shouldSkip) {
      // Skip this step, continue to next
      await recordStepSkipped(instance.id, nextStepIndex, nextStep.name);
      console.log(`[WorkflowEngine] Skipping step ${nextStepIndex} (${nextStep.name})`);
      return advanceStep(instanceId, stepResult); // Recursive call
    }
  }

  // Update current step index
  await setCurrentStep(instance.id, nextStepIndex);

  // Enqueue next step
  await enqueueStep(
    instance.id,
    instance.instanceId,
    definition,
    nextStep,
    nextStepIndex,
    instance.context,
    { retryPolicy: definition.retryPolicy }
  );

  console.log(`[WorkflowEngine] Enqueued step ${nextStepIndex} (${nextStep.name}) for instance ${instanceId}`);

  return { success: true, instanceId, details: { advancedTo: nextStepIndex } };
}
