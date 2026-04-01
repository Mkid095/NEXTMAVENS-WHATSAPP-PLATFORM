/**
 * Workflow Compensation - Loader & Persistence
 * Functions for loading workflow instances and recording compensation events
 */

import { prisma } from '../prisma';
import type { WorkflowInstance, StepExecutionContext } from './types';

/**
 * Load workflow instance with definition and history
 */
export async function loadWorkflowInstance(instanceId: string): Promise<WorkflowInstance | null> {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: {
      definition: true,
      stepsHistory: {
        orderBy: { stepIndex: 'asc' }
      }
    }
  });

  if (!instance) return null;

  return {
    ...instance,
    status: instance.status as any,
    context: instance.contextJson as Record<string, unknown>,
    definition: {
      ...instance.definition,
      steps: instance.definition.stepsJson as any[],
      compensation: instance.definition.compensationJson as any | undefined
    },
    stepsHistory: instance.stepsHistory.map(h => ({
      ...h,
      status: h.status as any,
      input: h.inputJson as Record<string, unknown> | undefined,
      output: h.outputJson as Record<string, unknown> | undefined,
      metadata: h.metadata as Record<string, unknown> | undefined
    }))
  };
}

/**
 * Record a compensation event in step history
 */
export async function recordCompensation(
  instanceId: string,
  stepIndex: number,
  stepName: string,
  context: StepExecutionContext
): Promise<void> {
  await prisma.workflowStepHistory.create({
    data: {
      instanceId,
      stepIndex,
      stepName,
      status: 'COMPENSATED',
      startedAt: new Date(),
      completedAt: new Date(),
      inputJson: {
        stepIndex,
        stepName,
        context: context.context as any,
        reason: 'compensation'
      } as any,
      outputJson: { compensated: true } as any,
      metadata: {
        compensation: true,
        triggeredBy: context.orgId
      } as any
    }
  });
}

/**
 * Check if instance status allows compensation
 */
export function isCompensatable(status: string): boolean {
  const compensatable = ['FAILED', 'RUNNING', 'COMPENSATING'];
  return compensatable.includes(status);
}

/**
 * Update workflow instance status after compensation
 */
export async function updateInstanceCompensationStatus(
  instanceId: string,
  allSucceeded: boolean,
  errors: Array<{ stepIndex: number; error: string }>
): Promise<void> {
  const status = allSucceeded ? 'COMPENSATED' : 'FAILED';
  const failureReason = allSucceeded ? undefined : `Compensation failed: ${errors.map(e => `Step ${e.stepIndex}: ${e.error}`).join('; ')}`;

  await prisma.workflowInstance.update({
    where: { id: instanceId },
    data: {
      status,
      failedAt: allSucceeded ? null : new Date(),
      failureReason
    }
  });

  console.log(`[Compensation] Instance ${instanceId} compensation completed with status: ${status}`);
}
