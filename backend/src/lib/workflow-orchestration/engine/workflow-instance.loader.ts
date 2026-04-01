/**
 * Workflow Instance Loader
 *
 * Handles complex queries for workflow instances with related data.
 */

import { prisma } from '../../prisma';
import type { WorkflowInstance } from '../types';

/**
 * Load a workflow instance by its instanceId (public string ID)
 * Includes definition and step history
 */
export async function loadInstance(instanceId: string): Promise<WorkflowInstance | null> {
  const instance = await prisma.workflowInstance.findFirst({
    where: { instanceId },
    include: {
      definition: true
    },
    orderBy: { startedAt: 'desc' }
  });

  if (!instance) return null;

  // Load step history
  const history = await prisma.workflowStepHistory.findMany({
    where: { instanceId: instance.id },
    orderBy: [
      { stepIndex: 'asc' },
      { startedAt: 'asc' }
    ]
  });

  return {
    id: instance.id,
    instanceId: instance.instanceId,
    definitionId: instance.definitionId,
    status: instance.status as any,
    currentStep: instance.currentStep,
    context: instance.contextJson as Record<string, unknown>,
    startedAt: instance.startedAt,
    completedAt: instance.completedAt,
    failedAt: instance.failedAt,
    failureReason: instance.failureReason,
    lastHeartbeatAt: instance.lastHeartbeatAt,
    orgId: instance.orgId,
    definition: {
      id: instance.definition.id,
      workflowId: instance.definition.workflowId,
      name: instance.definition.name,
      description: instance.definition.description,
      version: instance.definition.version,
      steps: instance.definition.stepsJson as any[],
      compensation: instance.definition.compensationJson as any,
      timeoutMs: instance.definition.timeoutMs,
      retryPolicy: instance.definition.retryPolicyJson as any,
      isActive: instance.definition.isActive,
      createdBy: instance.definition.createdBy,
      createdAt: instance.definition.createdAt,
      updatedAt: instance.definition.updatedAt
    },
    stepsHistory: history.map(h => ({
      id: h.id,
      instanceId: h.instanceId,
      stepIndex: h.stepIndex,
      stepName: h.stepName,
      status: h.status as any,
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      failedAt: h.failedAt,
      errorMessage: h.errorMessage,
      retryCount: h.retryCount,
      input: h.inputJson as Record<string, unknown> | undefined,
      output: h.outputJson as Record<string, unknown> | undefined,
      metadata: h.metadata as Record<string, unknown> | undefined
    }))
  };
}
