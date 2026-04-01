/**
 * Workflow Orchestration - Definitions Service
 * CRUD operations for workflow definitions
 */

import { prisma } from '../prisma';
import type { WorkflowDefinition } from './types';

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
 * Update a workflow definition (creates new version in real scenario, for now updates existing)
 */
export async function updateWorkflowDefinition(
  id: string,
  updates: Partial<WorkflowDefinition>
): Promise<WorkflowDefinition> {
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
