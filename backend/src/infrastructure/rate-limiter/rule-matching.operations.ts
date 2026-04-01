/**
 * Rate Limiter Rule Matching Operations
 * Find the most appropriate rate limit rule for a request
 */

import type { RateLimitRule, RateLimitConfig } from './types';

/**
 * Match endpoint pattern (supports * wildcards)
 */
export function matchEndpoint(endpoint: string, pattern: string): boolean {
  if (pattern === endpoint) return true;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return endpoint.startsWith(prefix);
  }
  return false;
}

/**
 * Find applicable rule implementation (pure function, reusable by both classes)
 */
export function findRuleImplementation(
  config: RateLimitConfig,
  endpoint: string,
  orgId?: string,
  instanceId?: string
): RateLimitRule {
  const rules = config.rules;
  let bestMatch: RateLimitRule | null = null;
  let score = 0;

  for (const rule of rules) {
    let ruleScore = 0;

    // Check endpoint pattern (must match)
    if (rule.endpoint === '*' || matchEndpoint(endpoint, rule.endpoint)) {
      ruleScore += 1;
    } else {
      continue;
    }

    // Check orgId with specificity: exact match > wildcard > mismatch
    // Treat both null and undefined as wildcard (no org restriction)
    if (orgId) {
      if (rule.orgId === orgId) {
        ruleScore += 2; // specific org match
      } else if (rule.orgId == null) {
        ruleScore += 1; // wildcard org (matches any)
      } else {
        continue; // org mismatch
      }
    } else {
      // No orgId provided in request: only rules with orgId=null/undefined (wildcard) match
      if (rule.orgId != null) {
        continue;
      }
      // wildcard matches, no extra points
    }

    // Check instanceId with specificity: exact match > wildcard > mismatch
    if (instanceId) {
      if (rule.instanceId === instanceId) {
        ruleScore += 2; // specific instance match
      } else if (rule.instanceId == null) {
        ruleScore += 1; // wildcard instance
      } else {
        continue; // instance mismatch
      }
    } else {
      // No instanceId provided: only rules with instanceId=null/undefined match
      if (rule.instanceId != null) {
        continue;
      }
      // wildcard matches, no extra points
    }

    if (ruleScore > score) {
      score = ruleScore;
      bestMatch = rule;
    }
  }

  return bestMatch || config.defaultRule;
}
