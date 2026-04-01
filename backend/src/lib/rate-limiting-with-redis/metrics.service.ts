/**
 * Rate Limiting Metrics Service
 * Handles metrics tracking and aggregation
 */

import type { RateLimitRule, RateLimitMetrics } from './types';

export interface RuleMetric {
  requests: number;
  allowed: number;
  blocked: number;
}

export interface OrgMetric {
  requests: number;
  allowed: number;
  blocked: number;
}

/**
 * Create a fresh metrics object
 */
export function createMetrics(): RateLimitMetrics {
  return {
    totalRequests: 0,
    allowedRequests: 0,
    blockedRequests: 0,
    byRule: {},
    byOrg: {},
    lastCleanup: new Date()
  };
}

/**
 * Update metrics counters for a request
 */
export function updateMetrics(
  metrics: RateLimitMetrics,
  rule: RateLimitRule,
  identifier: string,
  allowed: boolean
): void {
  metrics.totalRequests++;

  if (allowed) {
    metrics.allowedRequests++;
  } else {
    metrics.blockedRequests++;
  }

  // Track by rule
  if (!metrics.byRule[rule.id]) {
    metrics.byRule[rule.id] = { requests: 0, allowed: 0, blocked: 0 };
  }
  metrics.byRule[rule.id].requests++;
  if (allowed) {
    metrics.byRule[rule.id].allowed++;
  } else {
    metrics.byRule[rule.id].blocked++;
  }

  // Track by org if identifier contains orgId (format: "org:{orgId}:...")
  const parts = identifier.split(':');
  if (parts[0] === 'org' && parts.length >= 2) {
    const orgId = parts[1];
    if (!metrics.byOrg[orgId]) {
      metrics.byOrg[orgId] = { requests: 0, allowed: 0, blocked: 0 };
    }
    metrics.byOrg[orgId].requests++;
    if (allowed) {
      metrics.byOrg[orgId].allowed++;
    } else {
      metrics.byOrg[orgId].blocked++;
    }
  }
}

/**
 * Deep clone metrics (for safe external access)
 */
export function cloneMetrics(metrics: RateLimitMetrics): RateLimitMetrics {
  return {
    ...metrics,
    byRule: JSON.parse(JSON.stringify(metrics.byRule)),
    byOrg: JSON.parse(JSON.stringify(metrics.byOrg))
  };
}
