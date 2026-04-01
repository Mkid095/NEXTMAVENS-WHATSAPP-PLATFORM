/**
 * Workflow Engine - Starter Operations
 *
 * Handles starting new workflow instances.
 */

import type { StartWorkflowOptions, StartWorkflowResult, WorkflowStatus } from '../../types';
import { WorkflowStatus as WorkflowStatusEnum } from '../../types';
import { generateInstanceId } from '../../queue';
import {
  loadActiveDefinition,
  createWorkflowInstance,
  failWorkflow as persistFailWorkflow
} from '../workflow-persistence.repository';
import {
  transitionInstanceStatus,
  enqueueStep
} from '../workflow-step-enqueuer.service';

/**
 * Start a new workflow instance
 */
export async function startWorkflow(
  definitionId: string,
  orgId: string,
  options: StartWorkflowOptions = {}
): Promise<StartWorkflowResult> {
  console.log(`[WorkflowEngine] Starting workflow ${definitionId} for org ${orgId}`);

  // Load active workflow definition
  const definition = await loadActiveDefinition(definitionId);
  if (!definition) {
    throw new Error(`Workflow definition ${definitionId} not found or inactive`);
  }

  // Generate unique instance ID
  const instanceId = generateInstanceId();

  // Build initial context (merge definition defaults with provided)
  const initialContext = {
    ...(definition as any).initialContext ?? {},
    ...options.context
  };

  // Create workflow instance in database
  const { dbId } = await createWorkflowInstance(
    instanceId,
    definition.id,
    WorkflowStatusEnum.PENDING,
    initialContext,
    orgId
  );

  console.log(`[WorkflowEngine] Created instance ${instanceId} (id: ${dbId})`);

  // Transition to RUNNING and enqueue first step
  await transitionInstanceStatus(dbId, WorkflowStatusEnum.RUNNING, 'start');

  try {
    const firstStep = definition.steps[0];
    if (!firstStep) {
      throw new Error('Workflow has no steps defined');
    }

    // Enqueue first step
    await enqueueStep(
      dbId,
      instanceId,
      definition,
      firstStep,
      0,
      initialContext,
      options
    );

    return {
      instanceId,
      status: WorkflowStatusEnum.RUNNING,
      firstStepIndex: 0,
      message: `Workflow started successfully, first step enqueued`
    };
  } catch (error: any) {
    // If enqueue fails, mark instance as FAILED
    await persistFailWorkflow(dbId, `Failed to enqueue first step: ${error}`);

    throw error;
  }
}
