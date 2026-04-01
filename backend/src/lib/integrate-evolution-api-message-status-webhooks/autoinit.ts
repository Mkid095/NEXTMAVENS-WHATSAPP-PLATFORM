/**
 * Auto-initialize from environment variables
 *
 * This module is imported for its side effects.
 * It automatically initializes the webhook processor if the required
 * environment variable is present.
 */

import { initializeWebhookProcessor } from './config-manager';

if (process.env.EVOLUTION_WEBHOOK_SECRET) {
  const retryPolicy = {
    maxAttempts: parseInt(process.env.WEBHOOK_RETRY_MAX_ATTEMPTS || '3', 10),
    initialDelayMs: parseInt(process.env.WEBHOOK_RETRY_INITIAL_DELAY_MS || '1000', 10),
    backoffFactor: parseFloat(process.env.WEBHOOK_RETRY_BACKOFF_FACTOR || '2'),
    maxDelayMs: parseInt(process.env.WEBHOOK_RETRY_MAX_DELAY_MS || '10000', 10),
  };

  initializeWebhookProcessor({
    webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET,
    retryPolicy,
  });
}
