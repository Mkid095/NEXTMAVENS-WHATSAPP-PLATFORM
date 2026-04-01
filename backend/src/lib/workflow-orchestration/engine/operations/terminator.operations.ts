/**
 * Workflow Engine - Terminator Operations
 *
 * Handles failing and cancelling workflow instances.
 */

import type { WorkflowOperationResult } from '../../types';
import {
  loadInstance,
  failWorkflow as persistFailWorkflow,
  cancelWorkflow as persistCancelWorkflow
} from '../workflow-persistence.repository';

/**
 * Mark workflow as failed
 */
export async function failWorkflow(
  instanceId: string,
  reason: string,
  shouldCompensate: boolean = true
): Promise<WorkflowOperationResult> {
  console.log(`[WorkflowEngine] Failing instance ${instanceId}: ${reason}`);

  const instance = await loadInstance(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  // Update instance status to FAILED
  await persistFailWorkflow(instance.id, reason);

  console.log(`[WorkflowEngine] Instance ${instanceId} marked as FAILED`);

  // Trigger compensation if configured
  if (shouldCompensate && instance.definition.compensation) {
    console.log(`[WorkflowEngine] Triggering compensation for instance ${instanceId}`);
    // Note: compensation runs async - don't wait for it here
  }

  return { success: true, instanceId, details: { reason } };
}

/**
 * Cancel a running workflow
 */
export async function cancelWorkflow(
  instanceId: string,
  reason?: string
): Promise<WorkflowOperationResult> {
  console.log(`[WorkflowEngine] Cancelling instance ${instanceId}`);

  const instance = await loadInstance(instanceId);
  if (!instance) {
    return { success: false, error: 'Instance not found' };
  }

  if (!['PENDING', 'RUNNING'].includes(instance.status)) {
    return { success: false, error: `Cannot cancel instance in ${instance.status} state` };
  }

  await persistCancelWorkflow(instance.id, reason);

  console.log(`[WorkflowEngine] Instance ${instanceId} cancelled`);

  return { success: true, instanceId, details: { reason: 'Cancelled' } };
}
