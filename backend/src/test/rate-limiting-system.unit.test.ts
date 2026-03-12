/**
 * Unit Tests: Rate Limiting System
 * Tests core sliding window algorithm and middleware logic
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  RedisSlidingWindowRateLimiter,
  RateLimitRule,
  RateLimitConfig,
  getDefaultRateLimitConfig
} from '../lib/rate-limiting-with-redis/types';

// Mock Redis client with pipeline support
function createMockRedis() {
  const store = new Map<string, number[]>(); // key -> [timestamps]

  // Multi (pipeline) state - use a single array that we clear, not reallocate
  let multiCommands: Array<{ cmd: string; args: any[] }> = [];

  const multi = {
    zRemRangeByScore(key: string, min: number, max: number) {
      multiCommands.push({ cmd: 'zRemRangeByScore', args: [key, min, max] });
      return this; // synchronous return for chaining
    },
    zAdd(key: string, score: number, member: string) {
      multiCommands.push({ cmd: 'zAdd', args: [key, score, member] });
      return this;
    },
    expire(key: string, seconds: number) {
      multiCommands.push({ cmd: 'expire', args: [key, seconds] });
      return this;
    },
    zCard(key: string) {
      multiCommands.push({ cmd: 'zCard', args: [key] });
      return this;
    },
    async exec() {
      const results: any[] = [];
      for (const q of multiCommands) {
        const { cmd, args } = q;
        switch (cmd) {
          case 'zRemRangeByScore': {
            const [key, min, max] = args;
            let entries = store.get(key) || [];
            const before = entries.length;
            entries = entries.filter(t => t < min || t > max);
            store.set(key, entries);
            results.push(before - entries.length);
            break;
          }
          case 'zAdd': {
            const [key, score] = args;
            let entries = store.get(key) || [];
            entries.push(score);
            store.set(key, entries);
            results.push(1);
            break;
          }
          case 'expire': {
            results.push(1); // mock success
            break;
          }
          case 'zCard': {
            const [key] = args;
            results.push((store.get(key) || []).length);
            break;
          }
        }
      }
      multiCommands.length = 0; // Clear instead of reassigning
      return results;
    }
  };

  const redis: any = {
    multi() {
      multiCommands.length = 0; // Clear in place to preserve reference
      return multi;
    },
    async zRange(key: string, start: number, stop: number) {
      const entries = store.get(key) || [];
      return entries.slice(start, stop + 1);
    },
    async del(key: string) {
      const deleted = store.has(key) ? 1 : 0;
      store.delete(key);
      return deleted;
    },
    async ttl(key: string) {
      return -1;
    },
    async scan(cursor: number, MATCH?: string, COUNT?: number) {
      const matchStr = MATCH?.replace('*', '') || '';
      const keys = Array.from(store.keys()).filter(k => !matchStr || k.includes(matchStr));
      return { keys, cursor: 0 };
    },
    async ping() {
      return 'PONG';
    },
    async quit() {
      store.clear();
      return 'OK';
    }
  };

  return redis;
}

describe('RedisSlidingWindowRateLimiter', () => {
  let limiter: RedisSlidingWindowRateLimiter;
  let mockRedis: any;

  const defaultRule: RateLimitRule = {
    id: 'test-default',
    endpoint: '/test',
    maxRequests: 10,
    windowMs: 60000,
    trackMetrics: true
  };

  const config: RateLimitConfig = {
    defaultRule,
    rules: [],
    enabled: true,
    redisPrefix: 'test_rate',
    cleanupIntervalMs: 0 // Disable background cleanup for tests
  };

  beforeEach(() => {
    mockRedis = createMockRedis();
    limiter = new RedisSlidingWindowRateLimiter(config, mockRedis);
  });

  describe('check()', () => {
    it('should allow requests under the limit', async () => {
      const result = await limiter.check('test:identifier', defaultRule);
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.currentCount, 1);
      assert.strictEqual(result.remaining, 9);
    });

    it('should increment count on each request', async () => {
      for (let i = 0; i < 5; i++) {
        await limiter.check('test:identifier', defaultRule);
      }
      const result = await limiter.check('test:identifier', defaultRule);
      assert.strictEqual(result.currentCount, 6);
      assert.strictEqual(result.remaining, 4);
    });

    it('should block requests when limit exceeded', async () => {
      const identifier = 'test:exceed';
      for (let i = 0; i < 10; i++) {
        await limiter.check(identifier, defaultRule);
      }
      const result = await limiter.check(identifier, defaultRule);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.remaining, 0);
    });

    it('should allow requests after window expires', async () => {
      const identifier = 'test:expire';
      const rule: RateLimitRule = {
        ...defaultRule,
        windowMs: 100 // 100ms window for testing
      };

      // Fill up to limit
      for (let i = 0; i < 10; i++) {
        await limiter.check(identifier, rule);
      }
      let result = await limiter.check(identifier, rule);
      assert.strictEqual(result.allowed, false);

      // Wait for window to pass
      await new Promise(resolve => setTimeout(resolve, 150));

      result = await limiter.check(identifier, rule);
      assert.strictEqual(result.allowed, true, 'Should allow after window expires');
    });

    it('should handle different identifiers separately', async () => {
      const rule: RateLimitRule = {
        ...defaultRule,
        maxRequests: 2
      };

      const result1 = await limiter.check('id1', rule);
      assert.strictEqual(result1.allowed, true);

      const result2 = await limiter.check('id2', rule);
      assert.strictEqual(result2.allowed, true);
      // id1 and id2 have separate counts
    });

    it('should fail open on Redis error', async () => {
      const brokenRedis = {
        multi() {
          throw new Error('Redis down');
        }
      };
      const brokenLimiter = new RedisSlidingWindowRateLimiter(config, brokenRedis);

      const result = await brokenLimiter.check('test', defaultRule);
      assert.strictEqual(result.allowed, true, 'Should fail open on error');
    });
  });

  describe('getStatus()', () => {
    it('should return current count without incrementing', async () => {
      // Make some requests
      await limiter.check('status-test', defaultRule);
      await limiter.check('status-test', defaultRule);

      const status = await limiter.getStatus('status-test', defaultRule);
      assert.strictEqual(status.currentCount, 2);
      assert.strictEqual(status.remaining, 8);
    });

    it('should not increment counter when called repeatedly', async () => {
      await limiter.getStatus('no-increment', defaultRule);
      await limiter.getStatus('no-increment', defaultRule);
      await limiter.getStatus('no-increment', defaultRule);

      const status = await limiter.getStatus('no-increment', defaultRule);
      assert.strictEqual(status.currentCount, 0);
    });
  });

  describe('reset()', () => {
    it('should clear rate limit for identifier', async () => {
      const identifier = 'to-reset';
      for (let i = 0; i < 5; i++) {
        await limiter.check(identifier, defaultRule);
      }

      let before = await limiter.getStatus(identifier, defaultRule);
      assert.strictEqual(before.currentCount, 5);

      const success = await limiter.reset(identifier, defaultRule);
      assert.strictEqual(success, true);

      const after = await limiter.getStatus(identifier, defaultRule);
      assert.strictEqual(after.currentCount, 0);
    });

    it('should return false when no rate limit exists', async () => {
      const success = await limiter.reset('nonexistent', defaultRule);
      assert.strictEqual(success, false);
    });
  });

  describe('metrics', () => {
    it('should track total requests', async () => {
      await limiter.check(' metrics1', defaultRule);
      await limiter.check('metrics1', defaultRule);
      await limiter.check('metrics2', defaultRule);

      const metrics = limiter.getMetrics();
      assert.strictEqual(metrics.totalRequests, 3);
      assert.strictEqual(metrics.allowedRequests, 3);
      assert.strictEqual(metrics.blockedRequests, 0);
    });

    it('should track blocked requests', async () => {
      const rule: RateLimitRule = {
        ...defaultRule,
        maxRequests: 1
      };

      await limiter.check('blocked', rule); // allowed
      await limiter.check('blocked', rule); // blocked

      const metrics = limiter.getMetrics();
      assert.strictEqual(metrics.allowedRequests, 1);
      assert.strictEqual(metrics.blockedRequests, 1);
    });

    it('should track by rule ID', async () => {
      const rule2: RateLimitRule = {
        id: 'rule-2',
        endpoint: '/other',
        maxRequests: 10,
        windowMs: 60000,
        trackMetrics: true
      };

      await limiter.check('test', defaultRule);
      await limiter.check('test', rule2);

      const metrics = limiter.getMetrics();
      assert.ok(metrics.byRule[defaultRule.id]);
      assert.ok(metrics.byRule[rule2.id]);
      assert.strictEqual(metrics.byRule[defaultRule.id].requests, 1);
      assert.strictEqual(metrics.byRule[rule2.id].requests, 1);
    });

    it('should track by org if identifier contains org', async () => {
      const orgId = 'org-123';
      const identifier = `org:${orgId}:ip:127.0.0.1`;
      const rule: RateLimitRule = {
        ...defaultRule,
        trackMetrics: true
      };

      await limiter.check(identifier, rule);
      await limiter.check(identifier, rule);

      const metrics = limiter.getMetrics();
      assert.ok(metrics.byOrg[orgId]);
      assert.strictEqual(metrics.byOrg[orgId].requests, 2);
    });

    it('should reset metrics', async () => {
      await limiter.check('reset-test', defaultRule);
      await limiter.check('reset-test', defaultRule);

      let metrics = limiter.getMetrics();
      assert.strictEqual(metrics.totalRequests, 2);

      limiter.resetMetrics();

      metrics = limiter.getMetrics();
      assert.strictEqual(metrics.totalRequests, 0);
      assert.deepStrictEqual(metrics.byRule, {});
      assert.deepStrictEqual(metrics.byOrg, {});
    });
  });

  describe('findRule()', () => {
    it('should return default rule when no specific rule matches', () => {
      const rule = limiter.findRule('/some/endpoint');
      assert.strictEqual(rule.id, config.defaultRule.id);
    });

    it('should match endpoint pattern', () => {
      const specificRule: RateLimitRule = {
        id: 'specific',
        endpoint: '/api/messages/*',
        maxRequests: 100,
        windowMs: 60000,
        trackMetrics: true
      };
      const configWithRule: RateLimitConfig = {
        ...config,
        rules: [specificRule]
      };
      const limiter2 = new RedisSlidingWindowRateLimiter(configWithRule, mockRedis);

      const rule = limiter2.findRule('/api/messages/send');
      assert.strictEqual(rule.id, 'specific');
    });

    it('should prefer more specific rules (org+instance > org > instance > endpoint)', () => {
      const rule1: RateLimitRule = { id: 'r1', endpoint: '/*', maxRequests: 100, windowMs: 60000, trackMetrics: true, orgId: null, instanceId: null };
      const rule2: RateLimitRule = { id: 'r2', endpoint: '/*', maxRequests: 50, windowMs: 60000, trackMetrics: true, orgId: 'org-1', instanceId: null };
      const rule3: RateLimitRule = { id: 'r3', endpoint: '/*', maxRequests: 25, windowMs: 60000, trackMetrics: true, orgId: 'org-1', instanceId: 'inst-1' };

      const cfg: RateLimitConfig = { ...config, rules: [rule1, rule2, rule3] };
      const limiter2 = new RedisSlidingWindowRateLimiter(cfg, mockRedis);

      // org-1 + inst-1 should match rule3 (most specific)
      const rule = limiter2.findRule('/*', 'org-1', 'inst-1');
      assert.strictEqual(rule.id, 'r3');
    });
  });
});

describe('getDefaultRateLimitConfig', () => {
  it('should return config with env overrides', () => {
    // Set env temporarily
    const original = process.env.RATE_LIMIT_DEFAULT_MAX;
    process.env.RATE_LIMIT_DEFAULT_MAX = '200';
    process.env.RATE_LIMIT_DEFAULT_WINDOW_MS = '120000';

    const cfg = getDefaultRateLimitConfig();
    assert.strictEqual(cfg.defaultRule.maxRequests, 200);
    assert.strictEqual(cfg.defaultRule.windowMs, 120000);

    // Restore
    if (original) {
      process.env.RATE_LIMIT_DEFAULT_MAX = original;
    } else {
      delete process.env.RATE_LIMIT_DEFAULT_MAX;
    }
    delete process.env.RATE_LIMIT_DEFAULT_WINDOW_MS;
  });

  it('should use sensible defaults when env not set', () => {
    delete process.env.RATE_LIMIT_DEFAULT_MAX;
    delete process.env.RATE_LIMIT_DEFAULT_WINDOW_MS;

    const cfg = getDefaultRateLimitConfig();
    assert.strictEqual(cfg.defaultRule.maxRequests, 100);
    assert.strictEqual(cfg.defaultRule.windowMs, 60000);
  });
});
