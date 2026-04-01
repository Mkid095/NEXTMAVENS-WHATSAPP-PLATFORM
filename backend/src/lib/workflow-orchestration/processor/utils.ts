/**
 * Processor Utilities
 */

import type { StepExecutionContext, StepExecutionResult } from '../types';

/**
 * Get action type string for retry policy lookup
 */
export function resolveActionType(action: { type: string; config: Record<string, unknown> }): string {
  const { type, config } = action;

  if (type === 'message' && config.messageType === 'template') {
    return 'send-template';
  }
  if (type === 'message') {
    return 'send-message';
  }
  if (type === 'api-call' || type === 'queue-job') {
    return 'api-call';
  }

  return 'default';
}
