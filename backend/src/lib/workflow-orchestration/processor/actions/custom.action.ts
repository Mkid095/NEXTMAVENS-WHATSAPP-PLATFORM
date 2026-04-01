/**
 * Custom Action Executor
 *
 * Placeholder for custom step handlers that can be extended.
 */

import type { StepExecutionContext, StepExecutionResult } from '../../types';

/**
 * Execute custom action
 * Placeholder for custom step handlers
 */
export async function executeCustomAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { handler, params } = config;

  // Custom handlers should be registered separately
  // For now, this is a placeholder that can be extended
  console.log(`[WorkflowProcessor] Custom action: ${handler}`, params);

  // Simulate success for now
  return {
    success: true,
    output: { handler, executed: true },
    metadata: { custom: true }
  };
}
