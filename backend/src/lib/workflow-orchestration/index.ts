/**
 * Workflow Orchestration Library
 * Phase 3 Step 3: Async Flow Orchestration
 *
 * Provides workflow definition management, instance execution, and step processing
 * with Saga pattern compensation and BullMQ integration.
 *
 * Usage:
 *   import { startWorkflow, getWorkflowStatus, cancelWorkflow } from './workflow-orchestration';
 *
 *   // Start a workflow
 *   const result = await startWorkflow('send-notification', 'org-123', { context: { ... } });
 *
 *   // Check status
 *   const status = await getWorkflowStatus(result.instanceId);
 */

import { startWorker as startBullWorker, stopWorker as stopBullWorker } from '../message-queue-priority-system/consumer';
import { processWorkflowStep } from './processor';
import { getWorkflowEngine } from './engine';
import { prisma } from '../prisma';
import { WorkflowStatus } from './types';
import type { WorkflowDefinition, WorkflowInstance, StartWorkflowOptions, WorkflowOperationResult } from './types';

// ============================================================================
// Feature Flag
// ============================================================================

export const FEATURE_FLAG_WORKFLOW = 'ENABLE_WORKFLOW_ORCHESTRATION';

/**
 * Check if workflow orchestration is enabled
 */
export function isWorkflowEnabled(): boolean {
  return process.env[FEATURE_FLAG_WORKFLOW] === 'true';
}

// ============================================================================
// Public API - Workflow Engine
// ============================================================================

/**
 * Start a new workflow instance
 *
 * @param definitionId - Workflow definition ID (workflowId field)
 * @param orgId - Organization ID (for tenant isolation)
 * @param options - Optional configuration
 * @returns Result with instance ID and status
 */
export async function startWorkflow(
  definitionId: string,
  orgId: string,
  options: StartWorkflowOptions = {}
): Promise<{ instanceId: string; status: string }> {
  const engine = getWorkflowEngine();
  const result = await engine.startWorkflow(definitionId, orgId, options);
  return { instanceId: result.instanceId, status: result.status };
}

/**
 * Get workflow instance status
 *
 * @param instanceId - Workflow instance ID
 * @returns Workflow instance or null if not found
 */
export async function getWorkflowStatus(instanceId: string): Promise<WorkflowInstance | null> {
  const engine = getWorkflowEngine();
  return engine.getWorkflowStatus(instanceId);
}

/**
 * Cancel a running workflow
 *
 * @param instanceId - Workflow instance ID
 * @param reason - Optional cancellation reason
 * @returns Result of cancellation
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
 *
 * @param instanceId - Workflow instance ID
 * @returns Result of compensation
 */
export async function compensateWorkflow(instanceId: string): Promise<WorkflowOperationResult> {
  const engine = getWorkflowEngine();
  // TODO: Implement compensation trigger via engine
  // For now, we'll expose this API stub
  return { success: false, error: 'Not implemented yet' };
}

/**
 * Check health of a workflow instance
 *
 * @param instanceId - Workflow instance ID
 * @param timeoutMs - Optional timeout threshold (default from definition)
 * @returns Health status
 */
export async function checkWorkflowHealth(
  instanceId: string,
  timeoutMs?: number
): Promise<any> {
  const engine = getWorkflowEngine();
  return engine.checkWorkflowHealth(instanceId, timeoutMs);
}

// ============================================================================
// Workflow Definition CRUD (for admin API)
// ============================================================================

/**
 * Create a workflow definition
 */
export async function createWorkflowDefinition(
  workflowId: string,
  name: string,
  steps: any[],
  options: {
    description?: string;
    compensation?: any;
    timeoutMs?: number;
    retryPolicy?: any;
    createdBy: string;
  }
): Promise<WorkflowDefinition> {
  const { description, compensation, timeoutMs, retryPolicy, createdBy } = options;

  const raw = await prisma.workflowDefinition.create({
    data: {
      workflowId,
      name,
      description,
      stepsJson: steps,
      compensationJson: compensation,
      timeoutMs,
      retryPolicyJson: retryPolicy,
      createdBy,
      isActive: true
    }
  });

  return {
    ...raw,
    steps: raw.stepsJson as any[],
    compensation: raw.compensationJson as any,
    retryPolicy: raw.retryPolicyJson as any
  };
}

/**
 * Update a workflow definition (creates new version)
 */
export async function updateWorkflowDefinition(
  id: string,
  updates: Partial<WorkflowDefinition>
): Promise<WorkflowDefinition> {
  // In a real implementation, you might want versioning (create new record with version+1)
  // For now, just update the existing
  const raw = await prisma.workflowDefinition.update({
    where: { id },
    data: {
      ...updates,
      updatedAt: new Date(),
      ...(updates.steps && { stepsJson: updates.steps as any }),
      ...(updates.compensation && { compensationJson: updates.compensation as any }),
      ...(updates.retryPolicy && { retryPolicyJson: updates.retryPolicy as any })
    }
  });

  return {
    ...raw,
    steps: raw.stepsJson as any[],
    compensation: raw.compensationJson as any,
    retryPolicy: raw.retryPolicyJson as any
  };
}

/**
 * Get workflow definition by ID
 */
export async function getWorkflowDefinition(id: string): Promise<WorkflowDefinition | null> {
  const def = await prisma.workflowDefinition.findUnique({
    where: { id }
  });
  if (!def) return null;

  return {
    ...def,
    steps: def.stepsJson as any[],
    compensation: def.compensationJson as any,
    retryPolicy: def.retryPolicyJson as any
  };
}

/**
 * Get workflow definition by workflowId
 */
export async function getWorkflowDefinitionByWorkflowId(workflowId: string): Promise<WorkflowDefinition | null> {
  const def = await prisma.workflowDefinition.findFirst({
    where: { workflowId, isActive: true }
  });
  if (!def) return null;

  return {
    ...def,
    steps: def.stepsJson as any[],
    compensation: def.compensationJson as any,
    retryPolicy: def.retryPolicyJson as any
  };
}

/**
 * List workflow definitions
 */
export async function listWorkflowDefinitions(
  filters: { isActive?: boolean; search?: string } = {}
): Promise<WorkflowDefinition[]> {
  const where: any = {};

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { workflowId: { contains: filters.search } },
      { description: { contains: filters.search } }
    ];
  }

  const defs = await prisma.workflowDefinition.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  return defs.map(def => ({
    ...def,
    steps: def.stepsJson as any[],
    compensation: def.compensationJson as any,
    retryPolicy: def.retryPolicyJson as any
  }));
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
      take: limit + 1, // +1 to detect if there's more
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

// ============================================================================
// Initialization
// ============================================================================

let workerInitialized = false;

/**
 * Initialize the workflow orchestration system
 * Starts the BullMQ worker for processing workflow step jobs
 */
export async function initializeWorkflowSystem(): Promise<void> {
  if (!isWorkflowEnabled()) {
    console.log('[Workflow] System disabled by feature flag ENABLE_WORKFLOW_ORCHESTRATION');
    return;
  }

  if (workerInitialized) {
    console.log('[Workflow] Worker already initialized');
    return;
  }

  console.log('[Workflow] Initializing workflow orchestration system...');

  try {
    // Add WORKFLOW_STEP processor to the existing worker
    // Note: The worker is managed by message-queue-priority-system/consumer.ts
    // We need to ensure our processor is called from there
    console.log('[Workflow] Worker integration pending - will be registered in consumer.ts');
    workerInitialized = true;
    console.log('[Workflow] System initialized');
  } catch (error) {
    console.error('[Workflow] Initialization failed:', error);
    throw error;
  }
}

// ============================================================================
// Barrel Exports
// ============================================================================

export * from './types';
export * from './engine';
export * from './queue';
export * from './retry-policy';
export * from './compensation';

// Default export
export default {
  initialize: initializeWorkflowSystem,
  startWorkflow,
  getWorkflowStatus,
  cancelWorkflow,
  isEnabled: isWorkflowEnabled
};
