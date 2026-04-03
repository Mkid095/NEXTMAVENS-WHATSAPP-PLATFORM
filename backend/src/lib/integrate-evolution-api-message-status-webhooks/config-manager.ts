/**
 * Webhook Processor Configuration Manager
 *
 * Manages the singleton configuration for the webhook processor.
 */

import type { WebhookProcessorConfig } from './types';

let config: WebhookProcessorConfig | null = null;

/**
 * Default retry policy for webhook processing
 */
export const DEFAULT_RETRY_POLICY = {
  id: 'webhook-default',
  name: 'Webhook Default',
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
  maxDelayMs: 10000,
};

/**
 * Initialize the webhook processor with configuration
 *
 * Should be called once at application startup.
 */
export function initializeWebhookProcessor(
  webhookConfig: WebhookProcessorConfig
): void {
  config = webhookConfig;

  if (!config.webhookSecret) {
    throw new Error('webhookSecret is required for signature verification');
  }

  console.log('✅ Evolution API webhook processor initialized');
}

/**
 * Ensure config is initialized
 */
export function ensureInitialized(): void {
  if (!config) {
    throw new Error(
      'Webhook processor not initialized. Call initializeWebhookProcessor() first.'
    );
  }
}

/**
 * Get the retry policy from configuration or use default
 */
export function getRetryPolicy(): typeof DEFAULT_RETRY_POLICY {
  if (config?.retryPolicy) {
    return {
      id: 'webhook-configured',
      name: 'Webhook Configured',
      maxAttempts: config.retryPolicy.maxAttempts,
      initialDelayMs: config.retryPolicy.initialDelayMs,
      backoffFactor: config.retryPolicy.backoffFactor,
      maxDelayMs: config.retryPolicy.maxDelayMs,
    };
  }
  return DEFAULT_RETRY_POLICY;
}

/**
 * Get the current webhook configuration (for debugging)
 */
export function getConfig(): WebhookProcessorConfig | null {
  return config;
}

/**
 * Verify the webhook processor is ready to use
 */
export function healthCheck(): boolean {
  return config !== null && config.webhookSecret.length > 0;
}
