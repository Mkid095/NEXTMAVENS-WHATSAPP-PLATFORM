/**
 * Workflow Engine - Health Check Operations
 *
 * Provides health status for workflow instances.
 */

import type { WorkflowInstance } from '../../types';
import { WorkflowStatus as WorkflowStatusEnum } from '../../types';
import { loadInstance } from '../workflow-persistence.repository';

/**
 * Check health of a workflow instance
 */
export async function checkWorkflowHealth(
  instanceId: string,
  timeoutMs?: number
): Promise<any> {
  const instance = await loadInstance(instanceId);
  if (!instance) {
    return { healthy: false, reason: 'not_found' };
  }

  const issues: string[] = [];
  const now = new Date();

  // Check if workflow is stuck in RUNNING for too long
  if (instance.status === 'RUNNING') {
    const runningTime = now.getTime() - instance.startedAt.getTime();
    const effectiveTimeout = timeoutMs ?? (instance.definition.timeoutMs ?? 3600000); // 1 hour default

    if (runningTime > effectiveTimeout) {
      issues.push(`Workflow exceeded timeout (${runningTime}ms > ${effectiveTimeout}ms)`);
    }
  }

  // Check last heartbeat (if used)
  if (instance.lastHeartbeatAt) {
    const heartbeatAge = now.getTime() - instance.lastHeartbeatAt.getTime();
    if (heartbeatAge > 60000) { // 1 minute
      issues.push(`stale`);
    }
  }

  return {
    instanceId: instance.instanceId,
    healthy: issues.length === 0,
    reason: issues.length > 0 ? issues[0] : undefined,
    status: instance.status,
    currentStep: instance.currentStep,
    lastHeartbeatAt: instance.lastHeartbeatAt
  };
}
