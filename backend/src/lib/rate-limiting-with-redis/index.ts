/**
 * Rate Limiting System with Redis
 * Core implementation: sliding window rate limiter and Fastify middleware
 */

import type { RateLimitConfig, RateLimitRule, RateLimitResult, RateLimitMetrics } from './types';
import { getDefaultRateLimitConfig } from './types';
import { RedisSlidingWindowRateLimiter } from './types';

/**
 * Creates a rate limiter instance with the given Redis client
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}, redisClient?: any): RateLimiterInstance {
  const fullConfig = { ...getDefaultRateLimitConfig(), ...config };

  // Use provided Redis client or import from queue system
  const redis = redisClient || getSharedRedisClient();

  const limiter = new RedisSlidingWindowRateLimiter(fullConfig, redis);
  return new RateLimiterInstance(limiter, fullConfig);
}

/**
 * Rate limiter instance
 */
export class RateLimiterInstance {
  private limiter: RedisSlidingWindowRateLimiter;
  public readonly config: RateLimitConfig;

  constructor(limiter: RedisSlidingWindowRateLimiter, config: RateLimitConfig) {
    this.limiter = limiter;
    this.config = config;
  }

  /**
   * Start background cleanup
   */
  start(): void {
    this.limiter.startBackgroundCleanup();
  }

  /**
   * Stop background cleanup
   */
  stop(): void {
    this.limiter.stopBackgroundCleanup();
  }

  /**
   * Check if a request is allowed
   */
  async check(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
    return this.limiter.check(identifier, rule);
  }

  /**
   * Get rate limit status without incrementing
   */
  async getStatus(identifier: string, rule: RateLimitRule): Promise<{
    currentCount: number;
    remaining: number;
    resetAfterMs: number;
  }> {
    return this.limiter.getStatus(identifier, rule);
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string, rule: RateLimitRule): Promise<boolean> {
    return this.limiter.reset(identifier, rule);
  }

  /**
   * Get current metrics
   */
  getMetrics(): RateLimitMetrics {
    return this.limiter.getMetrics();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.limiter.resetMetrics();
  }

  /**
   * Find the applicable rule for a request
   */
  findRule(endpoint: string, orgId?: string, instanceId?: string): RateLimitRule {
    const rules = this.config.rules;

    // Find most specific matching rule (org+instance > org > instance > endpoint > default)
    let bestMatch: RateLimitRule | null = null;
    let score = 0;

    for (const rule of rules) {
      let ruleScore = 0;

      // Check endpoint pattern
      if (rule.endpoint === '*' || this.matchEndpoint(endpoint, rule.endpoint)) {
        ruleScore += 1;
      } else {
        continue;
      }

      // Check orgId match
      if (rule.orgId === null || rule.orgId === orgId) {
        ruleScore += orgId ? 2 : 0;
      } else {
        continue;
      }

      // Check instanceId match
      if (rule.instanceId === null || rule.instanceId === instanceId) {
        ruleScore += instanceId ? 1 : 0;
      } else {
        continue;
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

// ============================================================================
// Shared Redis Client (reuse from message queue system)
// ============================================================================

let sharedRedisClient: any = null;

function getSharedRedisClient(): any {
  if (sharedRedisClient) {
    return sharedRedisClient;
  }

  // Import Redis configuration from message queue system
  try {
    const queueModule = require('../message-queue-priority-system');
    const redisOptions = queueModule.redisConnectionOptions || queueModule.default?.redisConnectionOptions;

    if (redisOptions) {
      const Redis = require('ioredis');
      sharedRedisClient = new Redis(redisOptions);
      console.log('[RateLimiter] Using shared Redis connection from message queue system');
      return sharedRedisClient;
    }
  } catch (error) {
    console.warn('[RateLimiter] Could not import Redis config from queue system, creating standalone client:', error.message);
  }

  // Fallback: create standalone Redis client from env
  const Redis = require('ioredis');
  sharedRedisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });

  return sharedRedisClient;
}

// ============================================================================
// Fastify Middleware
// ============================================================================

export interface RateLimitMiddlewareOptions {
  /** Rate limiter instance */
  limiter: RateLimiterInstance;
  /** Header to use for org ID (default: x-org-id) */
  orgIdHeader?: string;
  /** Header to use for instance ID (default: x-instance-id) */
  instanceIdHeader?: string;
  /** Skip rate limiting for certain paths (regex or function) */
  skip?: (req: any) => boolean;
  /** Key generator: create unique identifier for rate limit */
  keyGenerator?: (req: any) => string;
}

/**
 * Fastify middleware for rate limiting
 */
export function rateLimitMiddleware(options: RateLimitMiddlewareOptions): any {
  const { limiter, orgIdHeader = 'x-org-id', instanceIdHeader = 'x-instance-id', skip, keyGenerator } = options;

  return async (request: any, reply: any, done: any) => {
    try {
      // Check if global rate limiting is enabled
      if (!limiter.config.enabled) {
        return done();
      }

      // Skip if configured
      if (skip && skip(request)) {
        return done();
      }

      const endpoint = request.routeOptions?.path || request.routerPath || request.url;
      const orgId = request.headers[orgIdHeader] as string | undefined;
      const instanceId = request.headers[instanceIdHeader] as string | undefined;

      // Find applicable rule
      const rule = limiter.findRule(endpoint, orgId, instanceId);

      // Generate identifier (org:instance:ip or org:ip, etc.)
      const identifier = keyGenerator
        ? keyGenerator(request)
        : generateIdentifier(request, orgId, instanceId);

      // Check rate limit
      const result = await limiter.check(identifier, rule);

      // Add rate limit headers to response
      reply.header('X-RateLimit-Limit', rule.maxRequests.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + result.resetAfterMs / 1000).toString());

      if (!result.allowed) {
        reply.code(429);
        reply.header('Retry-After', Math.ceil(result.resetAfterMs / 1000).toString());
        reply.send({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil(result.resetAfterMs / 1000)} seconds`,
          retryAfter: Math.ceil(result.resetAfterMs / 1000),
          limit: rule.maxRequests,
          windowMs: rule.windowMs
        });
        return done(new Error('Rate limit exceeded') as any);
      }

      return done();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // Fail open on errors
      return done();
    }
  };
}

/**
 * Generate rate limit identifier
 * Format: org:{orgId}:ip:{ip} or org:{orgId}:instance:{instanceId} or instance:{instanceId}:ip:{ip} or ip:{ip}
 */
export function generateIdentifier(req: any, orgId?: string, instanceId?: string): string {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  if (orgId) {
    if (instanceId) {
      return `org:${orgId}:instance:${instanceId}:ip:${ip}`;
    }
    return `org:${orgId}:ip:${ip}`;
  }

  if (instanceId) {
    return `instance:${instanceId}:ip:${ip}`;
  }

  return `ip:${ip}`;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let rateLimiterInstance: RateLimiterInstance | null = null;

/**
 * Initialize the global rate limiter singleton
 */
export async function initializeRateLimiter(config?: Partial<RateLimitConfig>): Promise<RateLimiterInstance> {
  if (rateLimiterInstance) {
    return rateLimiterInstance;
  }

  rateLimiterInstance = createRateLimiter(config);
  rateLimiterInstance.start();

  console.log('[RateLimiter] Initialized', {
    enabled: rateLimiterInstance.config.enabled,
    defaultRule: rateLimiterInstance.config.defaultRule,
    rulesCount: rateLimiterInstance.config.rules.length
  });

  return rateLimiterInstance;
}

/**
 * Get the global rate limiter instance
 */
export function getRateLimiter(): RateLimiterInstance | null {
  return rateLimiterInstance;
}

/**
 * Shutdown rate limiter
 */
export async function shutdownRateLimiter(): Promise<void> {
  if (rateLimiterInstance) {
    rateLimiterInstance.stop();
    rateLimiterInstance = null;
    console.log('[RateLimiter] Shutdown complete');
  }
}
