/**
 * Message Queue Priority System - Analytics & Webhook Job Types
 */

import type { MessageType } from './enums';
import type { BaseJobData } from './base.types';

/**
 * Job data for analytics events
 */
export interface AnalyticsEventJobData extends BaseJobData {
  type: MessageType.ANALYTICS_EVENT;
  payload: {
    eventName: string;
    properties: Record<string, unknown>;
    userId?: string;
    orgId?: string;
    timestamp?: string;
  };
}

/**
 * Job data for webhook events
 */
export interface WebhookEventJobData extends BaseJobData {
  type: MessageType.WEBHOOK_EVENT;
  payload: {
    webhookId: string;
    event: string;
    payload: unknown;
    timestamp?: string;
  };
}
