/**
 * Workflow Retry Policies - Configuration
 * Default retry policies per step type
 */

import type { RetryPolicy } from './types';

export const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  // Message-related steps
  'send-message': {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 300000, // 5 minutes
    jitterFactor: 0.15
  },
  'send-template': {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  // API calls
  'api-call': {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 120000,
    jitterFactor: 0.1
  },
  // Database operations
  'db-update': {
    maxAttempts: 3,
    baseDelayMs: 200,
    maxDelayMs: 30000,
    jitterFactor: 0.1
  },
  // Default fallback
  'default': {
    maxAttempts: 2,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitterFactor: 0.1
  }
};
