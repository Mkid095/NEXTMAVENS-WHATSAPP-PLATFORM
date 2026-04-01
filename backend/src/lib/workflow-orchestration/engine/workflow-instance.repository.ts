/**
 * Workflow Instance Repository
 *
 * Handles write operations for workflow instances.
 */

import { prisma } from '../../prisma';
import type { WorkflowStatus } from '../status.types';
import type { WorkflowInstance } from '../instance.types';

/**
 * Create a new workflow instance in database
 */
export async function createWorkflowInstance(
  instanceId: string,
  definitionId: string,
  status: WorkflowStatus,
  context: Record<string, unknown>,
  orgId: string
): Promise<{ id: string; dbId: string }> {
  const instance = await prisma.workflowInstance.create({
    data: {
      id: crypto.randomUUID(),
      instanceId,
      definitionId,
      status,
      currentStep: 0,
      contextJson: context as any,
      orgId,
      startedAt: new Date()
    }
  });

  return { id: instance.id, dbId: instance.id };
}

/**
 * Update workflow instance status
 */
export async function updateInstanceStatus(
  instanceDbId: string,
  status: WorkflowStatus,
  reason?: string
): Promise<void> {
  await prisma.workflowInstance.update({
    where: { id: instanceDbId },
    data: { status: status as any } // WorkflowStatus enum cast
  });
}

/**
 * Mark workflow as completed
 */
export async function completeWorkflow(instanceDbId: string): Promise<void> {
  await prisma.workflowInstance.update({
    where: { id: instanceDbId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      currentStep: null
    }
  });
}

/**
 * Mark workflow as failed
 */
export async function failWorkflow(
  instanceDbId: string,
  reason: string
): Promise<void> {
  await prisma.workflowInstance.update({
    where: { id: instanceDbId },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      failureReason: reason
    }
  });
}

/**
 * Cancel a workflow instance
 */
export async function cancelWorkflow(
  instanceDbId: string,
  reason?: string
): Promise<void> {
  await prisma.workflowInstance.update({
    where: { id: instanceDbId },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
      failureReason: reason ?? 'Cancelled by user'
    }
  });
}

/**
 * Update current step index
 */
export async function setCurrentStep(
  instanceDbId: string,
  stepIndex: number | null
): Promise<void> {
  await prisma.workflowInstance.update({
    where: { id: instanceDbId },
    data: { currentStep: stepIndex }
  });
}

/**
 * Load a workflow instance by its public instanceId
 */
export async function loadInstance(instanceId: string): Promise<WorkflowInstance | null> {
  const dbInstance = await prisma.workflowInstance.findUnique({
    where: { instanceId },
  });
  if (!dbInstance) return null;
  return {
    id: dbInstance.id,
    instanceId: dbInstance.instanceId,
    definitionId: dbInstance.definitionId,
    status: dbInstance.status as WorkflowStatus,
    currentStep: dbInstance.currentStep,
    context: dbInstance.contextJson as Record<string, unknown>,
    startedAt: dbInstance.startedAt,
    completedAt: dbInstance.completedAt,
    failedAt: dbInstance.failedAt,
    failureReason: dbInstance.failureReason,
    lastHeartbeatAt: dbInstance.lastHeartbeatAt,
    orgId: dbInstance.orgId
  };
}
