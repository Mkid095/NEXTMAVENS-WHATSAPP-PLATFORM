/**
 * Rate Limiter Metrics Operations
 * Update and manage rate limiting metrics
 */

import type { RateLimitRule } from './types';

/**
 * Update internal metrics counters (extracted from class)
 */
export function updateMetricsImplementation(
  limiter: any,
  rule: RateLimitRule,
  identifier: string,
  allowed: boolean
): void {
  limiter.metrics.totalRequests++;

  if (allowed) {
    limiter.metrics.allowedRequests++;
  } else {
    limiter.metrics.blockedRequests++;
  }

  // Track by rule
  if (!limiter.metrics.byRule[rule.id]) {
    limiter.metrics.byRule[rule.id] = { requests: 0, allowed: 0, blocked: 0 };
  }
  limiter.metrics.byRule[rule.id].requests++;
  if (allowed) {
    limiter.metrics.byRule[rule.id].allowed++;
  } else {
    limiter.metrics.byRule[rule.id].blocked++;
  }

  // Track by org if identifier contains orgId (format: "org:{orgId}:...")
  const parts = identifier.split(':');
  if (parts[0] === 'org' && parts.length >= 2) {
    const orgId = parts[1];
    if (!limiter.metrics.byOrg[orgId]) {
      limiter.metrics.byOrg[orgId] = { requests: 0, allowed: 0, blocked: 0 };
    }
    limiter.metrics.byOrg[orgId].requests++;
    if (allowed) {
      limiter.metrics.byOrg[orgId].allowed++;
    } else {
      limiter.metrics.byOrg[orgId].blocked++;
    }
  }
}
