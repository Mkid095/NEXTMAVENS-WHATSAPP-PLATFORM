/**
 * Rate Limit Rule Matcher
 * Determines which rule applies to a given request
 */

import type { RateLimitRule } from './types';
import { matchEndpoint } from './utils';

/**
 * Find the applicable rate limit rule for a given endpoint and optional org/instance IDs.
 * Matches rules based on endpoint pattern, orgId, and instanceId with priority.
 * Priority: org+instance > org > instance > endpoint > default
 */
export function findRule(
  rules: RateLimitRule[],
  endpoint: string,
  orgId?: string,
  instanceId?: string
): RateLimitRule | null {
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

  return bestMatch;
}
