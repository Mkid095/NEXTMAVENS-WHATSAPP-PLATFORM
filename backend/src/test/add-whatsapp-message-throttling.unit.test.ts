/**
 * WhatsApp Message Throttling System - Unit Tests
 *
 * Tests the core throttle logic with mocked Redis.
 */

/// <reference types="jest" />
import { describe, it, before, after, beforeEach, beforeAll, afterAll } from '@jest/globals';
import assert from 'node:assert';

// Mock Redis
const mockRedis: any = {
  data: new Map(),
  async zCard(key: string) {
    const set = this.data.get(key);
    if (!set) return 0;
    return set.size;
  },
  async zAdd(key: string, members: Array<{ score: number; value: string }>) {
    let set = this.data.get(key);
    if (!set) {
      set = new Map();
      this.data.set(key, set);
    }
    for (const m of members) {
      set.set(m.value, m.score);
    }
    return members.length;
  },
  async zRange(key: string, start: number, stop: number) {
    const set = this.data.get(key);
    if (!set) return [];
    const sorted = Array.from(set.entries()).sort((a, b) => a[1] - b[1]);
    return sorted.slice(start, stop + 1).map(entry => entry[0]);
  },
  async del(...keys: string[]) {
    let count = 0;
    for (const k of keys) {
      if (this.data.delete(k)) count++;
    }
    return count;
  },
  async expire(key: string, ttl: number) {
    return 1;
  },
  multi() {
    const self = this;
    const commands: Array<() => any> = [];
    const pipeline = {
      zAdd: jest.fn((key, members) => { commands.push(() => self.zAdd(key, members)); return pipeline; }),
      del: jest.fn((...keys) => { commands.push(() => self.del(...keys)); return pipeline; }),
      expire: jest.fn((key, ttl) => { commands.push(() => self.expire(key, ttl)); return pipeline; }),
      exec: jest.fn(async () => {
        const results = [];
        for (const cmd of commands) {
          results.push(await cmd());
        }
        commands.length = 0; // clear
        return results;
      }),
    };
    return pipeline;
  },
  async hSet(key: string, field: string, value: string) {
    let hash = this.data.get(key);
    if (!hash) {
      hash = new Map();
      this.data.set(key, hash);
    }
    hash.set(field, value);
    return 1;
  },
  async hGetAll(key: string) {
    const hash = this.data.get(key);
    if (!hash) return {};
    const obj: Record<string, string> = {};
    for (const [k, v] of hash.entries()) {
      obj[k] = v;
    }
    return obj;
  },
  async hDel(key: string, field: string) {
    const hash = this.data.get(key);
    if (!hash) return 0;
    return hash.delete(field) ? 1 : 0;
  },
  async connect() {},
  async quit() {},
};

// Mock the message-queue-priority-system to return our mockRedis
jest.doMock('../lib/message-queue-priority-system', () => ({
  redisConnectionOptions: { host: 'localhost', port: 6379 },
}));

// Mock createClient from redis
const originalCreateClient = require('redis').createClient;
beforeEach(() => {
  mockRedis.data.clear();
  (require('redis')).createClient = jest.fn().mockReturnValue(mockRedis);

  // Reset singleton internal state for test isolation using test helper
  if ((whatsAppMessageThrottle as any)._internal?.resetForTests) {
    (whatsAppMessageThrottle as any)._internal.resetForTests();
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Import after mocks setup
import { whatsAppMessageThrottle, WhatsAppMessageThrottle, ThrottleConfig } from '../lib/add-whatsapp-message-throttling';

// Enable fake timers for the entire suite
beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('WhatsApp Message Throttling System', () => {
  describe('Configuration', () => {
    it('should have a default throttle config', () => {
      const result = whatsAppMessageThrottle.getStatus('org1', 'inst1');
      assert.ok(result !== null);
    });

    it('should allow setting custom config', async () => {
      const config: ThrottleConfig = {
        orgId: 'org123',
        instanceId: 'inst456',
        messagesPerMinute: 50,
        messagesPerHour: 2000,
      };
      await whatsAppMessageThrottle.setConfig(config);
      const status = await whatsAppMessageThrottle.getStatus('org123', 'inst456');
      assert.strictEqual(status.allowed, true);
    });
  });

  describe('Throttle Logic', () => {
    it('should allow messages under the limit', async () => {
      const result = await whatsAppMessageThrottle.check('org1', 'inst1');
      assert.strictEqual(result.allowed, true);
      assert.ok(result.remainingMinute > 0);
    });

    it('should increment count on allowed check', async () => {
      await whatsAppMessageThrottle.check('org1', 'inst1');
      const status = await whatsAppMessageThrottle.getStatus('org1', 'inst1');
      assert.strictEqual(status.usedMinute, 1);
    });

    it('should allow up to limit', async () => {
      const config: ThrottleConfig = {
        orgId: 'org_limit',
        instanceId: 'inst_limit',
        messagesPerMinute: 3,
        messagesPerHour: 0,
      };
      await whatsAppMessageThrottle.setConfig(config);

      // First 3 should succeed
      for (let i = 0; i < 3; i++) {
        const result = await whatsAppMessageThrottle.check('org_limit', 'inst_limit');
        assert.strictEqual(result.allowed, true);
        jest.advanceTimersByTime(1); // advance time to avoid timestamp collision
      }

      // 4th should be blocked
      const blocked = await whatsAppMessageThrottle.check('org_limit', 'inst_limit');
      assert.strictEqual(blocked.allowed, false);
      assert.strictEqual(blocked.remainingMinute, 0);
    });

    it('should respect hourly limit independently', async () => {
      const config: ThrottleConfig = {
        orgId: 'org_hour',
        instanceId: 'inst_hour',
        messagesPerMinute: 100,
        messagesPerHour: 2,
      };
      await whatsAppMessageThrottle.setConfig(config);

      // First 2 should succeed
      for (let i = 0; i < 2; i++) {
        const result = await whatsAppMessageThrottle.check('org_hour', 'inst_hour');
        assert.strictEqual(result.allowed, true);
        jest.advanceTimersByTime(1); // advance time to avoid timestamp collision
      }

      // 3rd should be blocked by hourly limit even though minute limit allows
      const blocked = await whatsAppMessageThrottle.check('org_hour', 'inst_hour');
      assert.strictEqual(blocked.allowed, false);
      assert.strictEqual(blocked.remainingHour, 0);
    });

    it('should reset counters after reset()', async () => {
      // Exhaust minute limit
      const config: ThrottleConfig = {
        orgId: 'org_reset',
        instanceId: 'inst_reset',
        messagesPerMinute: 2,
        messagesPerHour: 0,
      };
      await whatsAppMessageThrottle.setConfig(config);

      for (let i = 0; i < 2; i++) {
        await whatsAppMessageThrottle.check('org_reset', 'inst_reset');
        jest.advanceTimersByTime(1);
      }

      let status = await whatsAppMessageThrottle.getStatus('org_reset', 'inst_reset');
      assert.strictEqual(status.usedMinute, 2);

      // Reset
      const resetResult = await whatsAppMessageThrottle.reset('org_reset', 'inst_reset');
      assert.strictEqual(resetResult, true);

      status = await whatsAppMessageThrottle.getStatus('org_reset', 'inst_reset');
      assert.strictEqual(status.usedMinute, 0);

      // Should be allowed again
      const result = await whatsAppMessageThrottle.check('org_reset', 'inst_reset');
      assert.strictEqual(result.allowed, true);
    });

    it('should return correct remaining count', async () => {
      const config: ThrottleConfig = {
        orgId: 'org_count',
        instanceId: 'inst_count',
        messagesPerMinute: 5,
        messagesPerHour: 0,
      };
      await whatsAppMessageThrottle.setConfig(config);

      for (let i = 0; i < 3; i++) {
        await whatsAppMessageThrottle.check('org_count', 'inst_count');
        jest.advanceTimersByTime(1);
      }

      const status = await whatsAppMessageThrottle.getStatus('org_count', 'inst_count');
      assert.strictEqual(status.usedMinute, 3);
      assert.strictEqual(status.remainingMinute, 2);
    });

    it('should fall back to org-level config', async () => {
      const orgConfig: ThrottleConfig = {
        orgId: 'org_global',
        instanceId: null,
        messagesPerMinute: 10,
        messagesPerHour: 0,
      };
      await whatsAppMessageThrottle.setConfig(orgConfig);

      // No instance-specific config, should use org-level
      const result = await whatsAppMessageThrottle.check('org_global', 'any_instance');
      assert.strictEqual(result.allowed, true);
    });

    it('should fall back to default when no config matches', async () => {
      // Don't set any specific config
      const result = await whatsAppMessageThrottle.check('unknown_org', 'unknown_inst');
      assert.strictEqual(result.allowed, true);
      // Should be using default (100/min)
      const status = await whatsAppMessageThrottle.getStatus('unknown_org', 'unknown_inst');
      assert.strictEqual(status.usedMinute, 1);
    });
  });

  describe('Metrics', () => {
    it('should track total requests, allowed, blocked', async () => {
      const config: ThrottleConfig = {
        orgId: 'org_metrics',
        instanceId: 'inst_metrics',
        messagesPerMinute: 1,
        messagesPerHour: 0,
      };
      await whatsAppMessageThrottle.setConfig(config);

      // First request allowed
      await whatsAppMessageThrottle.check('org_metrics', 'inst_metrics');
      jest.advanceTimersByTime(1);
      // Second request blocked
      await whatsAppMessageThrottle.check('org_metrics', 'inst_metrics');
      jest.advanceTimersByTime(1);

      const metrics = whatsAppMessageThrottle.getMetrics();
      assert.strictEqual(metrics.totalRequests, 2);
      assert.strictEqual(metrics.allowed, 1);
      assert.strictEqual(metrics.blocked, 1);
    });

    it('should reset metrics independently of throttle counters', async () => {
      await whatsAppMessageThrottle.check('org1', 'inst1');
      jest.advanceTimersByTime(1);
      whatsAppMessageThrottle.resetMetrics();
      const metrics = whatsAppMessageThrottle.getMetrics();
      assert.strictEqual(metrics.totalRequests, 0);
      assert.strictEqual(metrics.allowed, 0);
      assert.strictEqual(metrics.blocked, 0);
    });
  });
});
