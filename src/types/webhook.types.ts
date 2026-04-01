/**
 * Webhook Types
 * Types for webhook configuration and delivery tracking
 */

export interface WhatsAppWebhook {
  id: string;
  url: string;
  enabled: boolean;
  byEvents: boolean;
  base64: boolean;
  events: string[];
}

export interface WebhookDelivery {
  id: string;
  instanceId: string;
  event: string;
  status: 'success' | 'failed' | 'pending';
  responseCode?: number;
  responseBody?: string;
  duration?: number;
  createdAt: string;
}
