/**
 * Message Action Executor
 *
 * Sends a WhatsApp message using the message queue system.
 */

import type { StepExecutionContext, StepExecutionResult } from '../../types';
import { MessageType, addJob } from '../../../message-queue-priority-system';
import { MessagePriority } from '../../../message-queue-priority-system';

/**
 * Send a WhatsApp message (using existing message queue system)
 */
export async function executeMessageAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { to, message, messageType = 'text' } = config;

  // Use existing message queue to send
  const { addJob } = await import('../../../message-queue-priority-system');
  const messageData = {
    chatId: to as string,
    instanceId: (context.context.instanceId as string) || (context.context as any).instanceId,
    orgId: context.orgId,
    from: context.context.from as string || 'unknown',
    to: to as string,
    type: messageType as string,
    content: message as any,
    timestamp: new Date().toISOString()
  };

  try {
    const job = await addJob(MessageType.MESSAGE_UPSERT, messageData, {
      priority: MessagePriority.MEDIUM
    });

    return {
      success: true,
      output: { jobId: job.id, messageQueued: true },
      metadata: { queuedAt: new Date().toISOString() }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to queue message: ${error.message}`
    };
  }
}
