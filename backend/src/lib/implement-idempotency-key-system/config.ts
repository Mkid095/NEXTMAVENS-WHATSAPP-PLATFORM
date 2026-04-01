/**
 * Idempotency Default Configuration
 */

import type { IdempotencyConfig } from './types';

export const DEFAULT_IDEMPOTENCY_CONFIG: IdempotencyConfig = {
  keyPrefix: 'idempotency',
  ttl: 86400, // 24 hours
  includeBody: true,
  methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  cacheStatusCodes: [200, 201, 202, 204, 301, 302, 303, 304, 307, 308],
};
