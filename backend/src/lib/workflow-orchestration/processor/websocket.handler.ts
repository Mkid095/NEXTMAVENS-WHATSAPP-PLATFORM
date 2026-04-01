/**
 * WebSocket Event Handler for Workflow Processor
 *
 * Emits real-time events for step status changes.
 */

import { getSocketService } from '../../build-real-time-messaging-with-socket.io';

/**
 * Emit WebSocket event for step status change
 */
export function emitStepEvent(
  event: string,
  jobData: any,
  orgId: string,
  payload: Record<string, unknown>
): void {
  try {
    const socketService = getSocketService();
    if (!socketService) return;

    const eventData = {
      instanceId: jobData.instanceId,
      workflowId: jobData.workflowId,
      stepIndex: jobData.stepIndex,
      stepName: jobData.stepName,
      ...payload
    };

    // Emit to org room
    socketService.broadcastToOrg(orgId, event, eventData);

    console.log(`[WorkflowProcessor] Emitted ${event} for org ${orgId}`);
  } catch (err) {
    console.warn('[WorkflowProcessor] Failed to emit WebSocket event:', (err as Error).message);
  }
}
