/**
 * Delay Action Executor
 *
 * Pauses execution for a specified duration.
 */

import type { StepExecutionContext, StepExecutionResult } from '../../types';

/**
 * Delay execution (wait)
 */
export async function executeDelayAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { delayMs } = config;

  if (typeof delayMs !== 'number') {
    throw new Error('Delay action requires delayMs in config');
  }

  // Delay execution
  await new Promise(resolve => setTimeout(resolve, delayMs));

  return {
    success: true,
    output: { delayedMs: delayMs },
    metadata: { delayedAt: new Date().toISOString() }
  };
}
