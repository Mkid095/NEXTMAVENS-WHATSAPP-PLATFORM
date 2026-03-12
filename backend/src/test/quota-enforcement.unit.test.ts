/**
 * Unit Tests: Quota Enforcement Middleware
 * Tests QuotaLimiter class, middleware plugin, and period calculations
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import {
  QuotaLimiter,
  QuotaResult,
  PLAN_QUOTAS,
  QuotaMetric,
  QuotaPeriod,
  calculatePeriodStart,
  getPlanLimit
} from '../lib/implement-quota-enforcement-middleware';

// Mock PrismaClient with in-memory stores
function createMockPrisma() {
  let idCounter = 0;
  const quotaUsages = new Map<string, { id: string; orgId: string; metric: QuotaMetric; period: QuotaPeriod; periodStart: string; value: bigint }>();

  const prisma = {
    organization: {
      findUnique: async (args: { where: { id: string } }) => {
        // Mock org data
        if (args.where.id === 'org-free') return { id: 'org-free', plan: 'FREE' as any };
        if (args.where.id === 'org-starter') return { id: 'org-starter', plan: 'STARTER' as any };
        if (args.where.id === 'org-pro') return { id: 'org-pro', plan: 'PRO' as any };
        if (args.where.id === 'org-enterprise') return { id: 'org-enterprise', plan: 'ENTERPRISE' as any };
        return null;
      }
    },
    quotaUsage: {
      _getAll: () => new Map(quotaUsages), // for debugging
      findFirst: async (args: any) => {
        const { where } = args;
        // Support both composite where and ID where
        if (where.id) {
          for (const usage of quotaUsages.values()) {
            if (usage.id === where.id) return usage;
          }
          return null;
        }
        if (where.orgId && where.metric && where.period && where.periodStart) {
          const key = `${where.orgId}:${where.metric}:${where.period}:${where.periodStart}`;
          return quotaUsages.get(key) || null;
        }
        return null;
      },
      create: async (args: { data: any }) => {
        const id = `quota-${++idCounter}`;
        const usage = { ...args.data, id };
        const key = `${usage.orgId}:${usage.metric}:${usage.period}:${usage.periodStart}`;
        quotaUsages.set(key, usage);
        return usage;
      },
      update: async (args: { where: any; data: { value: bigint } }) => {
        let existing;
        if (args.where.id) {
          for (const usage of quotaUsages.values()) {
            if (usage.id === args.where.id) {
              existing = usage;
              break;
            }
          }
        } else if (args.where.orgId && args.where.metric && args.where.period && args.where.periodStart) {
          const key = `${args.where.orgId}:${args.where.metric}:${args.where.period}:${args.where.periodStart}`;
          existing = quotaUsages.get(key);
        }
        if (existing) {
          existing.value = args.data.value;
          return existing;
        }
        return args.data;
      },
      deleteMany: async (args: any) => {
        const { where } = args;
        let deleted = 0;
        for (const [key, usage] of quotaUsages.entries()) {
          let matches = true;
          if (where.orgId && usage.orgId !== where.orgId) matches = false;
          if (where.metric && usage.metric !== where.metric) matches = false;
          if (where.period && usage.period !== where.period) matches = false;
          if (matches) {
            quotaUsages.delete(key);
            deleted++;
          }
        }
        return { count: deleted };
      }
    },
    $transaction: async (fn: any) => {
      // Prisma's $transaction expects a function that receives a transaction client
      return await fn(prisma);
    }
  };

  return { prisma, clear: () => quotaUsages.clear() };
}

describe('PLAN_QUOTAS', () => {
  it('should define limits for all plans', () => {
    assert.ok(PLAN_QUOTAS.FREE);
    assert.ok(PLAN_QUOTAS.STARTER);
    assert.ok(PLAN_QUOTAS.PRO);
    assert.ok(PLAN_QUOTAS.ENTERPRISE);
  });

  it('should have increasing limits from FREE to ENTERPRISE', () => {
    assert.ok(PLAN_QUOTAS.FREE.messages_sent < PLAN_QUOTAS.STARTER.messages_sent);
    assert.ok(PLAN_QUOTAS.STARTER.messages_sent < PLAN_QUOTAS.PRO.messages_sent);
    assert.ok(PLAN_QUOTAS.PRO.messages_sent < PLAN_QUOTAS.ENTERPRISE.messages_sent);
  });

  it('should define all four metrics for each plan', () => {
    const metrics: QuotaMetric[] = ['messages_sent', 'active_instances', 'api_calls', 'storage_usage'];
    for (const plan of Object.values(PLAN_QUOTAS)) {
      for (const metric of metrics) {
        assert.ok(plan[metric] !== undefined, `${plan} missing ${metric}`);
        assert.strictEqual(typeof plan[metric], 'number');
      }
    }
  });
});

describe('calculatePeriodStart', () => {
  it('should calculate daily period start as UTC midnight', () => {
    // 2025-03-15T14:30:00Z → 2025-03-15T00:00:00Z
    const date = new Date('2025-03-15T14:30:00Z');
    const periodStart = calculatePeriodStart('daily', date);
    assert.strictEqual(periodStart, '2025-03-15T00:00:00.000Z');
  });

  it('should calculate monthly period start as 1st of month UTC', () => {
    // March 15, 2025 → March 1, 2025 00:00:00
    const date = new Date('2025-03-15T14:30:00Z');
    const periodStart = calculatePeriodStart('monthly', date);
    assert.strictEqual(periodStart, '2025-03-01T00:00:00.000Z');
  });

  it('should return ISO string with Z suffix', () => {
    const date = new Date('2025-03-15T14:30:00Z');
    const periodStart = calculatePeriodStart('daily', date);
    assert.ok(periodStart.endsWith('Z'));
  });

  it('should handle year boundary for daily', () => {
    const date = new Date('2025-01-01T01:00:00Z');
    const periodStart = calculatePeriodStart('daily', date);
    assert.strictEqual(periodStart, '2025-01-01T00:00:00.000Z');
  });

  it('should handle year boundary for monthly', () => {
    const date = new Date('2025-01-15T12:00:00Z');
    const periodStart = calculatePeriodStart('monthly', date);
    assert.strictEqual(periodStart, '2025-01-01T00:00:00.000Z');
  });

  it('should throw on unknown period type', () => {
    const date = new Date();
    assert.throws(() => calculatePeriodStart('weekly' as any, date));
  });
});

describe('getPlanLimit', () => {
  it('should return correct limit for FREE plan', () => {
    assert.strictEqual(getPlanLimit('FREE', 'messages_sent'), PLAN_QUOTAS.FREE.messages_sent);
    assert.strictEqual(getPlanLimit('FREE', 'active_instances'), PLAN_QUOTAS.FREE.active_instances);
    assert.strictEqual(getPlanLimit('FREE', 'api_calls'), PLAN_QUOTAS.FREE.api_calls);
    assert.strictEqual(getPlanLimit('FREE', 'storage_usage'), PLAN_QUOTAS.FREE.storage_usage);
  });

  it('should return correct limit for STARTER plan', () => {
    assert.strictEqual(getPlanLimit('STARTER', 'messages_sent'), PLAN_QUOTAS.STARTER.messages_sent);
  });

  it('should return correct limit for PRO plan', () => {
    assert.strictEqual(getPlanLimit('PRO', 'active_instances'), PLAN_QUOTAS.PRO.active_instances);
  });

  it('should return correct limit for ENTERPRISE plan', () => {
    assert.strictEqual(getPlanLimit('ENTERPRISE', 'api_calls'), PLAN_QUOTAS.ENTERPRISE.api_calls);
  });

  it('should throw on invalid plan', () => {
    assert.throws(() => getPlanLimit('UNKNOWN' as any, 'messages_sent'));
  });

  it('should throw on invalid metric', () => {
    assert.throws(() => getPlanLimit('FREE', 'unknown_metric' as any));
  });
});

describe('QuotaLimiter.check()', () => {
  let mock: ReturnType<typeof createMockPrisma>;
  let limiter: QuotaLimiter;

  beforeEach(() => {
    mock = createMockPrisma();
    limiter = new QuotaLimiter({ prisma: mock.prisma });
  });

  it('should allow first request when usage is zero', async () => {
    const result = await limiter.check('org-free', 'messages_sent', 1);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.current, 1);
    assert.strictEqual(result.limit, PLAN_QUOTAS.FREE.messages_sent);
    assert.ok(result.resetAt instanceof Date);
  });

  it('should increment count on subsequent requests', async () => {
    await limiter.check('org-free', 'messages_sent', 1);
    const result = await limiter.check('org-free', 'messages_sent', 1);
    assert.strictEqual(result.current, 2);
    assert.ok(result.allowed);
  });

  it('should block request when limit exceeded', async () => {
    const orgId = 'org-free';
    const limit = PLAN_QUOTAS.FREE.messages_sent;

    // Fill to limit
    for (let i = 0; i < limit; i++) {
      const r = await limiter.check(orgId, 'messages_sent', 1);
      assert.strictEqual(r.allowed, true, `Request ${i + 1} should be allowed`);
    }

    // Next request should be blocked
    const blocked = await limiter.check(orgId, 'messages_sent', 1);
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.current, limit);
    assert.strictEqual(blocked.remaining, 0);
  });

  it('should allow partial amounts', async () => {
    const result1 = await limiter.check('org-free', 'messages_sent', 10);
    assert.strictEqual(result1.current, 10);

    const result2 = await limiter.check('org-free', 'messages_sent', 5);
    assert.strictEqual(result2.current, 15);
  });

  it('should separate metrics by type', async () => {
    const msg1 = await limiter.check('org-free', 'messages_sent', 100);
    const api1 = await limiter.check('org-free', 'api_calls', 50);

    assert.strictEqual(msg1.current, 100);
    assert.strictEqual(api1.current, 50);
    assert.strictEqual(msg1.limit, PLAN_QUOTAS.FREE.messages_sent);
    assert.strictEqual(api1.limit, PLAN_QUOTAS.FREE.api_calls);
  });

  it('should separate usage by org', async () => {
    const org1 = await limiter.check('org-free', 'messages_sent', 10);
    const org2 = await limiter.check('org-starter', 'messages_sent', 10);

    assert.strictEqual(org1.current, 10);
    assert.strictEqual(org2.current, 10);
    assert.strictEqual(org1.limit, PLAN_QUOTAS.FREE.messages_sent);
    assert.strictEqual(org2.limit, PLAN_QUOTAS.STARTER.messages_sent);
  });

  it('should create new period when period boundary crossed', async () => {
    const orgId = 'org-free';
    const now = new Date('2025-03-15T12:00:00Z');
    const limit = PLAN_QUOTAS.FREE.messages_sent;

    // Fill to limit in current period
    for (let i = 0; i < limit; i++) {
      await limiter.check(orgId, 'messages_sent', 1, now);
    }

    // Verify blocked
    let result = await limiter.check(orgId, 'messages_sent', 1, now);
    assert.strictEqual(result.allowed, false);

    // Simulate next day (new period)
    const nextDay = new Date('2025-03-16T00:00:01Z');
    result = await limiter.check(orgId, 'messages_sent', 1, nextDay);
    assert.strictEqual(result.allowed, true, 'Should allow in new period');
    assert.strictEqual(result.current, 1);
  });

  it('should fail open on database error', async () => {
    const brokenPrisma = {
      organization: { findUnique: async () => null },
      quotaUsage: { findFirst: async () => { throw new Error('DB down'); } },
      create: async () => ({ value: BigInt(0) }),
      update: async () => ({ value: BigInt(0) }),
      $transaction: async (fn: any) => fn()
    };

    const brokenLimiter = new QuotaLimiter(brokenPrisma as any);
    const result = await brokenLimiter.check('org-free', 'messages_sent', 1);

    assert.strictEqual(result.allowed, true, 'Should fail open on DB error');
    assert.strictEqual(result.current, 0);
    assert.strictEqual(result.limit, PLAN_QUOTAS.FREE.messages_sent);
  });

  it('should respect plan-specific limits', async () => {
    const limits = [
      { org: 'org-free', plan: 'FREE' as const, expected: PLAN_QUOTAS.FREE.messages_sent },
      { org: 'org-starter', plan: 'STARTER' as const, expected: PLAN_QUOTAS.STARTER.messages_sent },
      { org: 'org-pro', plan: 'PRO' as const, expected: PLAN_QUOTAS.PRO.messages_sent },
      { org: 'org-enterprise', plan: 'ENTERPRISE' as const, expected: PLAN_QUOTAS.ENTERPRISE.messages_sent }
    ];

    for (const { org, expected } of limits) {
      const result = await limiter.check(org, 'messages_sent', expected);
      assert.strictEqual(result.limit, expected, `${org} should have limit ${expected}`);
      assert.strictEqual(result.allowed, true, `${org} should allow up to limit`);
    }
  });

  it('should track multiple metrics independently', async () => {
    // Test messages_sent
    await limiter.check('org-free', 'messages_sent', 500);
    let status = await limiter.getUsage('org-free', 'messages_sent', 'daily');
    assert.strictEqual(status, 500);

    // Test api_calls
    await limiter.check('org-free', 'api_calls', 5000);
    status = await limiter.getUsage('org-free', 'api_calls', 'daily');
    assert.strictEqual(status, 5000);

    // Ensure messages_sent unchanged
    status = await limiter.getUsage('org-free', 'messages_sent', 'daily');
    assert.strictEqual(status, 500);
  });
});

describe('QuotaLimiter.getUsage()', () => {
  let mock: ReturnType<typeof createMockPrisma>;
  let limiter: QuotaLimiter;

  beforeEach(() => {
    mock = createMockPrisma();
    limiter = new QuotaLimiter({ prisma: mock.prisma });
  });

  it('should return 0 for no usage', async () => {
    const usage = await limiter.getUsage('org-free', 'messages_sent', 'daily');
    assert.strictEqual(usage, 0);
  });

  it('should return current usage value', async () => {
    await limiter.check('org-free', 'messages_sent', 123);
    const usage = await limiter.getUsage('org-free', 'messages_sent', 'daily');
    assert.strictEqual(usage, 123);
  });
});

describe('QuotaLimiter.reset()', () => {
  let mock: ReturnType<typeof createMockPrisma>;
  let limiter: QuotaLimiter;

  beforeEach(() => {
    mock = createMockPrisma();
    limiter = new QuotaLimiter({ prisma: mock.prisma });
  });

  it('should reset usage for specific org and metric', async () => {
    await limiter.check('org-free', 'messages_sent', 1000);
    let usage = await limiter.getUsage('org-free', 'messages_sent', 'daily');
    assert.strictEqual(usage, 1000);

    const success = await limiter.reset('org-free', 'messages_sent', 'daily');
    assert.strictEqual(success, true);

    usage = await limiter.getUsage('org-free', 'messages_sent', 'daily');
    assert.strictEqual(usage, 0);
  });

  it('should reset all metrics for org when metric not specified', async () => {
    await limiter.check('org-free', 'messages_sent', 100);
    await limiter.check('org-free', 'api_calls', 500);

    const success = await limiter.reset('org-free', undefined, 'daily');
    assert.strictEqual(success, true);

    const messages = await limiter.getUsage('org-free', 'messages_sent', 'daily');
    const apiCalls = await limiter.getUsage('org-free', 'api_calls', 'daily');
    assert.strictEqual(messages, 0);
    assert.strictEqual(apiCalls, 0);
  });

  it('should return false when no usage to reset', async () => {
    const success = await limiter.reset('org-free', 'messages_sent', 'daily');
    assert.strictEqual(success, false);
  });
});

describe('Quota Middleware Plugin', () => {
  // Test middleware function behavior
  it('should be defined', () => {
    // This will be implemented after writing the actual middleware
    assert.ok(typeof require('../lib/implement-quota-enforcement-middleware') === 'object');
  });
});

describe('Integration: Period Boundary Conditions', () => {
  let mock: ReturnType<typeof createMockPrisma>;
  let limiter: QuotaLimiter;

  beforeEach(() => {
    mock = createMockPrisma();
    limiter = new QuotaLimiter({ prisma: mock.prisma });
  });

  it('should roll over exactly at midnight UTC', async () => {
    const orgId = 'org-free';
    const limit = PLAN_QUOTAS.FREE.messages_sent;
    const justBeforeMidnight = new Date('2025-03-15T23:59:59.999Z');
    const justAfterMidnight = new Date('2025-03-16T00:00:00.001Z');

    // Fill to limit before boundary
    for (let i = 0; i < limit; i++) {
      await limiter.check(orgId, 'messages_sent', 1, justBeforeMidnight);
    }

    // Blocked at end of day
    let result = await limiter.check(orgId, 'messages_sent', 1, justBeforeMidnight);
    assert.strictEqual(result.allowed, false);

    // Allowed immediately after midnight (new period)
    result = await limiter.check(orgId, 'messages_sent', 1, justAfterMidnight);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.current, 1);
  });

  it('should roll over on 1st of month', async () => {
    const orgId = 'org-free';
    const limit = PLAN_QUOTAS.FREE.messages_sent;
    const lastDayOfMonth = new Date('2025-02-28T23:59:59.999Z');
    const firstDayOfNextMonth = new Date('2025-03-01T00:00:00.001Z');

    // Fill to limit before month end
    for (let i = 0; i < limit; i++) {
      await limiter.check(orgId, 'messages_sent', 1, lastDayOfMonth);
    }

    // Blocked at end of month
    let result = await limiter.check(orgId, 'messages_sent', 1, lastDayOfMonth);
    assert.strictEqual(result.allowed, false);

    // Allowed on first of new month
    result = await limiter.check(orgId, 'messages_sent', 1, firstDayOfNextMonth);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.current, 1);
  });
});
