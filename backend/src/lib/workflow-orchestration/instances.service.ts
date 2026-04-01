/**
 * Workflow Orchestration - Instances Service
 * Operations on workflow instances
 */

import { getWorkflowEngine } from './engine';
import { prisma } from '../prisma';
import type { WorkflowInstance, WorkflowOperationResult, WorkflowStatus } from './types';

/**
 * Start a new workflow instance
 */
export async function startWorkflow(
  definitionId: string,
  orgId: string,
  options: { context?: Record<string, any> } = {}
): Promise<{ instanceId: string; status: string }> {
  const engine = getWorkflowEngine();
  const result = await engine.startWorkflow(definitionId, orgId, options);
  return { instanceId: result.instanceId, status: result.status };
}

/**
 * Get workflow instance status
 */
export async function getWorkflowStatus(instanceId: string): Promise<WorkflowInstance | null> {
  const engine = getWorkflowEngine();
  return engine.getWorkflowStatus(instanceId);
}

/**
 * Cancel a running workflow
 */
export async function cancelWorkflow(
  instanceId: string,
  reason?: string
): Promise<WorkflowOperationResult> {
  const engine = getWorkflowEngine();
  return engine.cancelWorkflow(instanceId, reason);
}

/**
 * Execute compensation for a failed workflow
 */
export async function compensateWorkflow(instanceId: string): Promise<WorkflowOperationResult> {
  const engine = getWorkflowEngine();
  // TODO: Implement compensation trigger via engine
  return { success: false, error: 'Not implemented yet' };
}

/**
 * Check health of a workflow instance
 */
export async function checkWorkflowHealth(
  instanceId: string,
  timeoutMs?: number
): Promise<any> {
  const engine = getWorkflowEngine();
  return engine.checkWorkflowHealth(instanceId, timeoutMs);
}

/**
 * List workflow instances
 */
export async function listWorkflowInstances(
  filters: {
    definitionId?: string;
    status?: string;
    orgId?: string;
    limit?: number;
    offset?: string;
  } = {}
): Promise<{ instances: WorkflowInstance[]; total: number; nextOffset?: string }> {
  const where: any = {};

  if (filters.definitionId) {
    where.definitionId = filters.definitionId;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.orgId) {
    where.orgId = filters.orgId;
  }

  const limit = filters.limit ?? 50;
  const skip = filters.offset ? 1 : 0; // Simple pagination for now

  const [instances, total] = await Promise.all([
    prisma.workflowInstance.findMany({
      where,
      take: limit + 1,
      skip,
      orderBy: { startedAt: 'desc' },
      include: {
        definition: true
      }
    }),
    prisma.workflowInstance.count({ where })
  ]);

  const hasMore = instances.length > limit;
  const paginatedInstances = hasMore ? instances.slice(0, limit) : instances;

  return {
    instances: paginatedInstances.map(inst => ({
      id: inst.id,
      instanceId: inst.instanceId,
      definitionId: inst.definitionId,
      status: inst.status as WorkflowStatus,
      currentStep: inst.currentStep,
      context: inst.contextJson as Record<string, unknown>,
      startedAt: inst.startedAt,
      completedAt: inst.completedAt,
      failedAt: inst.failedAt,
      failureReason: inst.failureReason,
      lastHeartbeatAt: inst.lastHeartbeatAt,
      orgId: inst.orgId,
      definition: {
        id: inst.definition.id,
        workflowId: inst.definition.workflowId,
        name: inst.definition.name,
        description: inst.definition.description,
        version: inst.definition.version,
        steps: inst.definition.stepsJson as any[],
        compensation: inst.definition.compensationJson as any,
        timeoutMs: inst.definition.timeoutMs,
        retryPolicy: inst.definition.retryPolicyJson as any,
        isActive: inst.definition.isActive,
        createdBy: inst.definition.createdBy,
        createdAt: inst.definition.createdAt,
        updatedAt: inst.definition.updatedAt
      }
    })),
    total,
    nextOffset: hasMore ? 'next' : undefined
  };
}
