/**
 * Workflow Compensation - Executor
 * Executes compensation actions (custom handlers)
 */

import type { CompensationAction, StepExecutionContext } from './types';

/**
 * Execute a single compensation action
 *
 * @param action - Compensation action configuration
 * @param context - Step execution context
 * @param workflowContext - Current workflow context (will be modified)
 */
export async function executeCompensationAction(
  action: CompensationAction,
  context: StepExecutionContext,
  workflowContext: Record<string, unknown>
): Promise<void> {
  const { type, action: actionConfig } = action;

  if (type === 'reverse') {
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
 * Plug-in point for specific rollback logic:
 * - Delete created records
 * - Restore previous state
 * - Send notifications
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
      await deleteMessage(config.messageId as string);
      break;

    case 'restore-state':
      await restoreState(config.table as string, config.id as string, config.previousState as Record<string, unknown>);
      break;

    case 'send-notification':
      await sendCompensationNotification(context, config);
      break;

    case 'update-context':
      Object.assign(workflowContext, config.updates);
      break;

    default:
      console.warn(`[Compensation] Unknown custom action type: ${type}`);
      throw new Error(`Unknown custom action type: ${type}`);
  }
}

// ============================================================================
// Placeholder Action Implementations (to be integrated with real systems)
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
