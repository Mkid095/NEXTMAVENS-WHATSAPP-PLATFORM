/**
 * Database Helpers for Workflow Processor
 *
 * Step history tracking and persistence operations.
 */

import { prisma } from '../../prisma';
import { WorkflowStepStatus } from '../types';

/**
 * Ensure a step history entry exists (create if not)
 */
export async function ensureStepHistoryEntry(jobData: any): Promise<void> {
  try {
    await prisma.workflowStepHistory.create({
      data: {
        instanceId: jobData.instanceId,
        stepIndex: jobData.stepIndex,
        stepName: jobData.stepName,
        status: 'RUNNING',
        startedAt: new Date(),
        inputJson: jobData.context as any,
        metadata: {
          jobId: jobData.instanceId, // Actually job ID (BullMQ)
          executionCount: jobData.executionCount
        }
      }
    });
  } catch (error: any) {
    // If constraint fails (duplicate step index), it's okay - maybe retry
    if (error.code !== 'P2002') {
      throw error;
    }
    console.warn(`[WorkflowProcessor] Step history entry already exists for instance ${jobData.instanceId}, step ${jobData.stepIndex}`);
  }
}

/**
 * Update step history with completion/failure status
 */
export async function updateStepHistory(
  instanceId: string,
  stepIndex: number,
  status: WorkflowStepStatus,
  errorMessage?: string,
  output?: Record<string, unknown>
): Promise<void> {
  const updateData: any = {
    status,
    completedAt: status === 'COMPLETED' || status === 'FAILED' || status === 'SKIPPED' ? new Date() : null,
    failedAt: status === 'FAILED' ? new Date() : null,
    errorMessage,
    outputJson: output
  };

  await prisma.workflowStepHistory.updateMany({
    where: {
      instanceId,
      stepIndex,
      status: 'RUNNING'
    },
    data: updateData
  });
}
