/**
 * Rate Limiter Type Definitions
 */

/**
 * Rate limit rule configuration
 */
export interface RateLimitRule {
  /** Unique identifier for this rule */
  id: string;
  /** Org ID (null = applies to all orgs) */
  orgId?: string | null;
  /** Instance ID (null = applies to all instances) */
  instanceId?: string | null;
  /** API endpoint pattern (e.g., '/api/messages/*') */
  endpoint: string;
  /** Maximum requests allowed in window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Whether to include this rule in metrics */
  trackMetrics: boolean;
}

/**
 * Rate limit result from check()
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Milliseconds until window resets (if limit exceeded) */
  resetAfterMs: number;
  /** Total requests in current window */
  currentCount: number;
  /** Applied rule that determined the limit */
  rule: RateLimitRule;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Default rule if no specific rule matches */
  defaultRule: RateLimitRule;
  /** List of specific rules (highest priority) */
  rules: RateLimitRule[];
  /** Whether rate limiting is globally enabled */
  enabled: boolean;
  /** Redis key prefix for rate limit entries */
  redisPrefix: string;
  /** How often to clean up expired keys (ms) */
  cleanupIntervalMs: number;
}

/**
 * Rate limit metrics
 */
export interface RateLimitMetrics {
  /** Total requests processed */
  totalRequests: number;
  /** Total requests allowed */
  allowedRequests: number;
  /** Total requests blocked */
  blockedRequests: number;
  /** Breakdown by rule ID */
  byRule: Record<string, {
    requests: number;
    allowed: number;
    blocked: number;
  }>;
  /** Breakdown by org (if applicable) */
  byOrg: Record<string, {
    requests: number;
    allowed: number;
    blocked: number;
  }>;
  /** Last cleanup time */
  lastCleanup: Date;
}
