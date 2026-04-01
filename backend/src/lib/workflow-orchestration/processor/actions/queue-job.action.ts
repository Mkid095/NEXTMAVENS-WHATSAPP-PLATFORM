/**
 * Queue Job Action Executor
 *
 * Adds a generic job to the message queue.
 */

import type { StepExecutionContext, StepExecutionResult } from '../../types';
import { MessageType, addJob, MessagePriority } from '../../../message-queue-priority-system';

/**
 * Add a job to the queue (generic)
 */
export async function executeQueueJobAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { jobType, payload } = config;

  // Note: jobType should be a valid MessageType from the queue system
  const { addJob } = await import('../../../message-queue-priority-system');
  const validJobType = ['MESSAGE_UPSERT', 'MESSAGE_STATUS_UPDATE', 'INSTANCE_STATUS_UPDATE', 'ANALYTICS_EVENT'].includes(jobType as string)
    ? (jobType as any)
    : 'ANALYTICS_EVENT';

  try {
    const job = await addJob(validJobType as MessageType, payload as any, {
      priority: MessagePriority.MEDIUM
    });

    return {
      success: true,
      output: { jobId: job.id },
      metadata: { jobType: jobType as string }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to add queue job: ${error.message}`
    };
  }
}
