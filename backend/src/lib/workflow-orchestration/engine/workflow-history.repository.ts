/**
 * Workflow History Repository
 *
 * Handles step execution history records.
 */

import { prisma } from '../../prisma';
import { WorkflowStepStatus } from '../status.types';

/**
 * Record that a step was skipped (condition not met)
 */
export async function recordStepSkipped(
  instanceId: string,
  stepIndex: number,
  stepName: string
): Promise<void> {
  await prisma.workflowStepHistory.create({
    data: {
      instanceId,
      stepIndex,
      stepName,
      status: WorkflowStepStatus.SKIPPED,
      startedAt: new Date(),
      completedAt: new Date(),
      metadata: { reason: 'condition_not_met' }
    }
  });
}
