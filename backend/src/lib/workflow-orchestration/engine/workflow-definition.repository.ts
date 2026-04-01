/**
 * Workflow Definition Repository
 *
 * Handles database operations for workflow definitions.
 */

import { prisma } from '../../prisma';
import type { WorkflowDefinition } from '../types';

/**
 * Load an active workflow definition by workflowId
 */
export async function loadActiveDefinition(workflowId: string): Promise<WorkflowDefinition | null> {
  const def = await prisma.workflowDefinition.findFirst({
    where: {
      workflowId,
      isActive: true
    }
  });

  if (!def) return null;

  return {
    ...def,
    steps: def.stepsJson as any[],
    compensation: def.compensationJson as any | undefined,
    retryPolicy: def.retryPolicyJson as any | undefined
  } as WorkflowDefinition;
}
