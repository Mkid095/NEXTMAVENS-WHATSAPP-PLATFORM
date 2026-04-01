/**
 * Rate Limiting Utilities
 */

import type { RateLimitRule } from './types';

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
 * Build rate limit Redis key
 */
export function buildRateLimitKey(
  prefix: string,
  ruleId: string,
  identifier: string
): string {
  return `${prefix}:${ruleId}:${identifier}`;
}

/**
 * Parse identifier components (org, instance, etc.)
 */
export function parseIdentifier(identifier: string): {
  type: 'org' | 'instance' | 'global';
  id: string;
} {
  const parts = identifier.split(':');

  if (parts[0] === 'org' && parts.length >= 2) {
    return { type: 'org', id: parts[1] };
  }
  if (parts[0] === 'instance' && parts.length >= 2) {
    return { type: 'instance', id: parts[1] };
  }

  return { type: 'global', id: identifier };
}
