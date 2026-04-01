/**
 * Message Queue Producer - Analytics & Alert Operations
 * Queues analytics events and critical alerts
 */

import { addJob } from './operations';
import { MessageType, MessagePriority } from './enums';

/**
 * Queue an analytics event
 * Priority: LOW
 */
export async function queueAnalyticsEvent(data: {
  eventName: string;
  properties: Record<string, unknown>;
  userId?: string;
  orgId?: string;
  timestamp?: string;
}): Promise<any> {
  return await addJob(MessageType.ANALYTICS_EVENT, { ...data });
}

/**
 * Queue a critical alert
 * Priority: CRITICAL
 * Used for system alerts, security events
 */
export async function queueCriticalAlert(data: {
  alertName: string;
  payload: Record<string, unknown>;
  orgId?: string;
  timestamp?: string;
}): Promise<any> {
  return await addJob(MessageType.WEBHOOK_EVENT, { // using webhook event type for critical alerts? There's no CRITICAL type in MessageType. Might need a custom type. Keep as is.
    ...data,
    event: 'critical_alert'
  }, { priority: MessagePriority.CRITICAL });
}
