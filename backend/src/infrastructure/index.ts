/**
 * Infrastructure Layer
 *
 * Re-exports from existing lib modules (gradual migration).
 * Eventually each module will be fully moved here.
 */

// Rate Limiting
export * from '../lib/rate-limiting-with-redis/index.js';
export { initialize as initializeRateLimiter } from '../lib/rate-limiting-with-redis/index.js';

// Quota Enforcement
export * from '../lib/implement-quota-enforcement-middleware/index.js';
export { initialize as initializeQuotaLimiter } from '../lib/implement-quota-enforcement-middleware/index.js';

// Metrics (Grafana/Prometheus)
export * from '../lib/create-comprehensive-metrics-dashboard-(grafana)/index.js';
export { setupMetrics } from '../lib/create-comprehensive-metrics-dashboard-(grafana)/index.js';

// Idempotency
export * from '../lib/implement-idempotency-key-system/index.js';
export { initialize as initializeIdempotency, registerOnSendHook } from '../lib/implement-idempotency-key-system/index.js';

// Retry & DLQ
export * as RetryDlq from '../lib/message-retry-and-dlq-system/index.js';
export { initializeRetryDlqSystem } from '../lib/message-retry-and-dlq-system/index.js';

// Feature Flags
export * from '../lib/feature-management/index.js';
export { initialize as initializeFeatureFlags } from '../lib/feature-management/index.js';

// Evolution API Client
export * from '../lib/evolution-api-client/index.js';
export { initializeEvolutionClient } from '../lib/evolution-api-client/instance.js';

// Already moved
export * from './websocket.js';
export { initializeSocket, getSocketService } from './websocket.js';
