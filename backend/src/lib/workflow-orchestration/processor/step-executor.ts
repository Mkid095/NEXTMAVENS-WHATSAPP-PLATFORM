/**
 * Step Executor
 *
 * Dispatches step execution to appropriate action handlers.
 * Each action type is implemented in separate files under ./actions.
 */

import type { StepExecutionContext, StepExecutionResult } from '../types';

import { executeMessageAction } from './actions/message.action';
import { executeApiCallAction } from './actions/api-call.action';
import { executeQueueJobAction } from './actions/queue-job.action';
import { executeDelayAction } from './actions/delay.action';
import { executeCustomAction } from './actions/custom.action';

/**
 * Execute a step's action
 * Dispatches to the appropriate action executor based on action type.
 *
 * @param action - Step action configuration
 * @param context - Execution context
 * @param instance - Workflow instance (for context)
 * @returns Step execution result
 */
export async function executeStep(
  action: { type: string; config: Record<string, unknown> },
  context: StepExecutionContext,
  instance: any
): Promise<StepExecutionResult> {
  const { type, config } = action;

  console.log(`[WorkflowProcessor] Executing action type: ${type} for step ${context.stepName}`);

  switch (type) {
    case 'message':
      return await executeMessageAction(config, context);

    case 'api-call':
      return await executeApiCallAction(config, context);

    case 'queue-job':
      return await executeQueueJobAction(config, context);

    case 'delay':
      return await executeDelayAction(config, context);

    case 'custom':
      return await executeCustomAction(config, context);

    case 'parallel':
      // Future: implement parallel step execution
      throw new Error('Parallel steps not yet implemented');

    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}
