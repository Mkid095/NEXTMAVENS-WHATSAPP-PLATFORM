/**
 * Processor Types
 *
 * Types for webhook processor configuration and results.
 */

/**
 * Configuration for the webhook processor
 */
export interface WebhookProcessorConfig {
  webhookSecret: string;
  retryPolicy?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
    maxDelayMs?: number;
  };
}

/**
 * Result of processing a webhook
 */
export interface WebhookProcessingResult {
  success: boolean;
  event?: string;
  instanceId?: string;
  orgId?: string;
  messageId?: string;
  processedAt: Date;
  error?: string;
}

/**
 * Information about a WhatsApp instance
 */
export interface InstanceInfo {
  id: string;
  orgId: string;
  status: string;
  webhookUrl?: string;
}

/**
 * Mapping from Evolution status to Prisma status
 */
export const EVOLUTION_TO_PRISMA_STATUS: Record<string, string> = {
  pending: 'PENDING',
  sending: 'SENDING',
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
  rejected: 'REJECTED',
};

