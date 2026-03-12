/**
 * Rate Limiting System with Redis
 * Sliding window algorithm for API protection
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

/**
 * Redis sliding window rate limiter
 * Uses sorted sets: ZADD with timestamp, ZREMRANGEBYSCORE for cleanup, ZCARD for count
 */
export class RedisSlidingWindowRateLimiter {
  private config: RateLimitConfig;
  private redis: any; // Redis client
  private metrics: RateLimitMetrics;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig, redisClient: any) {
    this.config = config;
    this.redis = redisClient;
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      byRule: {},
      byOrg: {},
      lastCleanup: new Date()
    };
  }

  /**
   * Start periodic cleanup of expired rate limit keys
   */
  startBackgroundCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredKeys().catch(console.error);
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Stop background cleanup
   */
  stopBackgroundCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Check if a request is allowed and update counters
   */
  async check(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const key = `${this.config.redisPrefix}:${rule.id}:${identifier}`;

    try {
      // Use Redis pipeline for atomic operations
      const results = await this.redis.multi()
        .zRemRangeByScore(key, 0, windowStart) // Remove old entries
        .zAdd(key, now, now) // Add current request timestamp
        .expire(key, Math.ceil(rule.windowMs / 1000) + 60) // Set TTL with buffer
        .zCard(key) // Get current count
        .exec();

      const [, , , count] = results;

      const allowed = count <= rule.maxRequests;
      const remaining = Math.max(0, rule.maxRequests - count);
      const resetAfterMs = allowed ? 0 : await this.estimateResetTime(key, rule);

      // Update metrics
      this.updateMetrics(rule, identifier, allowed);

      return {
        allowed,
        remaining,
        resetAfterMs,
        currentCount: count,
        rule
      };
    } catch (error) {
      console.error('Rate limiter error:', error);
      // On Redis error, fail open (allow request)
      return {
        allowed: true,
        remaining: rule.maxRequests,
        resetAfterMs: 0,
        currentCount: 0,
        rule
      };
    }
  }

  /**
   * Estimate when the rate limit will reset (approximate)
   */
  private async estimateResetTime(key: string, rule: RateLimitRule): Promise<number> {
    try {
      const oldest = await this.redis.zRange(key, 0, 0);
      if (oldest && oldest.length > 0) {
        const oldestTime = parseInt(oldest[0], 10);
        const resetTime = oldestTime + rule.windowMs;
        return Math.max(0, resetTime - Date.now());
      }
    } catch {
      // Ignore errors, return default
    }
    return rule.windowMs;
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getStatus(identifier: string, rule: RateLimitRule): Promise<{
    currentCount: number;
    remaining: number;
    resetAfterMs: number;
  }> {
    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const key = `${this.config.redisPrefix}:${rule.id}:${identifier}`;

    try {
      // Pipeline: zRemRangeByScore (result[0]), zCard (result[1])
      const [, count] = await this.redis.multi()
        .zRemRangeByScore(key, 0, windowStart)
        .zCard(key)
        .exec();

      return {
        currentCount: count,
        remaining: Math.max(0, rule.maxRequests - count),
        resetAfterMs: 0 // Would need to fetch oldest entry to calculate accurately
      };
    } catch (error) {
      console.error('Rate limiter getStatus error:', error);
      return {
        currentCount: 0,
        remaining: rule.maxRequests,
        resetAfterMs: 0
      };
    }
  }

  /**
   * Reset rate limit for a specific identifier (admin operation)
   */
  async reset(identifier: string, rule: RateLimitRule): Promise<boolean> {
    const key = `${this.config.redisPrefix}:${rule.id}:${identifier}`;
    try {
      const result = await this.redis.del(key);
      return result === 1;
    } catch (error) {
      console.error('Rate limiter reset error:', error);
      return false;
    }
  }

  /**
   * Clean up expired rate limit keys (ZREMRANGEBYSCORE already handles most)
   * This is a belt-and-suspenders approach to remove any keys that have expired
   * but were not cleaned due to Redis TTL issues.
   */
  private async cleanupExpiredKeys(): Promise<void> {
    try {
      // Scan for keys with our prefix
      const cursor = 0;
      const pattern = `${this.config.redisPrefix}:*`;
      const { keys } = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);

      const now = Date.now();
      let cleaned = 0;

      for (const key of keys) {
        try {
          // Check if key has any entries older than the maximum possible window
          // Since we don't know the rule's window, we'll remove keys that are truly ancient
          // Most cleanup happens via zRemRangeByScore in check()
          const ttl = await this.redis.ttl(key);
          if (ttl === -1) {
            // No TTL set (shouldn't happen but just in case)
            await this.redis.del(key);
            cleaned++;
          }
        } catch {
          // Ignore individual key errors
        }
      }

      if (cleaned > 0) {
        console.log(`[RateLimiter] Cleaned up ${cleaned} orphaned keys`);
      }

      this.metrics.lastCleanup = new Date();
    } catch (error) {
      console.error('Rate limiter cleanup error:', error);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): RateLimitMetrics {
    return {
      ...this.metrics,
      byRule: JSON.parse(JSON.stringify(this.metrics.byRule)),
      byOrg: JSON.parse(JSON.stringify(this.metrics.byOrg))
    };
  }

  /**
   * Reset metrics to zero
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      byRule: {},
      byOrg: {},
      lastCleanup: new Date()
    };
  }

  /**
   * Update internal metrics counters
   */
  private updateMetrics(rule: RateLimitRule, identifier: string, allowed: boolean): void {
    this.metrics.totalRequests++;

    if (allowed) {
      this.metrics.allowedRequests++;
    } else {
      this.metrics.blockedRequests++;
    }

    // Track by rule
    if (!this.metrics.byRule[rule.id]) {
      this.metrics.byRule[rule.id] = { requests: 0, allowed: 0, blocked: 0 };
    }
    this.metrics.byRule[rule.id].requests++;
    if (allowed) {
      this.metrics.byRule[rule.id].allowed++;
    } else {
      this.metrics.byRule[rule.id].blocked++;
    }

    // Track by org if identifier contains orgId (format: "org:{orgId}:...")
    const parts = identifier.split(':');
    if (parts[0] === 'org' && parts.length >= 2) {
      const orgId = parts[1];
      if (!this.metrics.byOrg[orgId]) {
        this.metrics.byOrg[orgId] = { requests: 0, allowed: 0, blocked: 0 };
      }
      this.metrics.byOrg[orgId].requests++;
      if (allowed) {
        this.metrics.byOrg[orgId].allowed++;
      } else {
        this.metrics.byOrg[orgId].blocked++;
      }
    }
  }

  /**
   * Find the applicable rate limit rule for a given endpoint and optional org/instance IDs.
   * Matches rules based on endpoint pattern, orgId, and instanceId with priority.
   * Priority: org+instance > org > instance > endpoint > default
   */
  findRule(endpoint: string, orgId?: string, instanceId?: string): RateLimitRule {
    const rules = this.config.rules;
    let bestMatch: RateLimitRule | null = null;
    let score = 0;

    for (const rule of rules) {
      let ruleScore = 0;

      // Check endpoint pattern (must match)
      if (rule.endpoint === '*' || this.matchEndpoint(endpoint, rule.endpoint)) {
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

    return bestMatch || this.config.defaultRule;
  }

  /**
   * Match endpoint pattern (supports * wildcards)
   */
  private matchEndpoint(endpoint: string, pattern: string): boolean {
    if (pattern === endpoint) return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return endpoint.startsWith(prefix);
    }
    return false;
  }
}

/**
 * Default rate limit configuration
 * Can be overridden via environment variables or database
 */
export function getDefaultRateLimitConfig(): RateLimitConfig {
  return {
    defaultRule: {
      id: 'default-global',
      orgId: null,
      instanceId: null,
      endpoint: '*',
      maxRequests: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || '100', 10),
      windowMs: parseInt(process.env.RATE_LIMIT_DEFAULT_WINDOW_MS || '60000', 10),
      trackMetrics: true
    },
    rules: [],
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    redisPrefix: 'rate_limit',
    cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
  };
}
