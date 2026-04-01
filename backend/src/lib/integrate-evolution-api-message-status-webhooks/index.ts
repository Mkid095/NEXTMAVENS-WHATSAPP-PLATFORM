/**
 * Evolution API Message Status Webhooks Integration
 *
 * Complete system for receiving and processing Evolution API webhooks
 * with signature verification, multi-tenancy support, and retry+DLA.
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Validation schemas
export * from './schemas';

// Signature verification utilities
export { verifyWebhookSignature, getSignatureFromRequest } from './signature';

// Payload parsing
export { parseWebhookPayload } from './parsers';

// Handlers (individual event handlers)
export * from './handlers';

// Dispatcher
export { dispatchWebhookHandler } from './dispatcher';

// Config management
export {
  initializeWebhookProcessor,
  ensureInitialized,
  getRetryPolicy,
  getConfig,
  healthCheck,
  DEFAULT_RETRY_POLICY
} from './config-manager';

// Core processing
export { processEvolutionWebhook } from './processor.core';

// Processor helpers
export { getInstanceInfo, setRlsContext } from './processor.helpers';

// Retry & DLQ integration
export { executeWithRetry } from '../build-retry-logic-with-progressive-backoff';
export { captureDeadLetter } from '../build-webhook-dead-letter-queue-system';

// Trigger auto-initialization from environment
import './autoinit';
