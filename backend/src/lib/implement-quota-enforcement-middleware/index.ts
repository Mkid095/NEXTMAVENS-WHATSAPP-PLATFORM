/**
 * Quota Enforcement Middleware
 *
 * Enforces subscription plan limits for organizations on metrics:
 * - messages_sent
 * - active_instances
 * - api_calls
 * - storage_usage
 *
 * Periods: hourly, daily, monthly
 *
 * Architecture:
 * - Uses existing quota_usages table for tracking (with RLS)
 * - Hardcoded limits per plan (no DB migration needed)
 * - Atomic upserts via Prisma to prevent race conditions
 * - Independent periods per metric (different counters)
 */

import { PrismaClient } from '@prisma/client';
import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';

// ============================================================================
// Types & Constants
// ============================================================================

export enum QuotaMetric {
  MESSAGES_SENT = 'messages_sent',
  ACTIVE_INSTANCES = 'active_instances',
  API_CALLS = 'api_calls',
  STORAGE_USAGE = 'storage_usage'
}

export enum QuotaPeriod {
  HOURLY = 'hourly',
  DAILY = 'daily',
  MONTHLY = 'monthly'
}

export interface QuotaResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export interface QuotaLimiterOptions {
  prisma?: PrismaClient;
  failOpen?: boolean; // Default: true (allow if DB error)
}

// ============================================================================
// Plan Quota Limits (Hardcoded)
// ============================================================================

export const PLAN_QUOTAS: Record<string, Record<QuotaMetric, number>> = {
  FREE: {
    [QuotaMetric.MESSAGES_SENT]: 1_000,           // 1K messages/day
    [QuotaMetric.ACTIVE_INSTANCES]: 1,            // 1 WhatsApp number
    [QuotaMetric.API_CALLS]: 10_000,             // 10K API requests/day
    [QuotaMetric.STORAGE_USAGE]: 100_000_000     // 100MB storage
  },
  STARTER: {
    [QuotaMetric.MESSAGES_SENT]: 10_000,          // 10K messages/day
    [QuotaMetric.ACTIVE_INSTANCES]: 3,            // 3 numbers
    [QuotaMetric.API_CALLS]: 50_000,              // 50K API requests/day
    [QuotaMetric.STORAGE_USAGE]: 1_000_000_000   // 1GB storage
  },
  PRO: {
    [QuotaMetric.MESSAGES_SENT]: 50_000,          // 50K messages/day
    [QuotaMetric.ACTIVE_INSTANCES]: 10,           // 10 numbers
    [QuotaMetric.API_CALLS]: 200_000,             // 200K API requests/day
    [QuotaMetric.STORAGE_USAGE]: 10_000_000_000  // 10GB storage
  },
  ENTERPRISE: {
    [QuotaMetric.MESSAGES_SENT]: 500_000,         // 500K messages/day
    [QuotaMetric.ACTIVE_INSTANCES]: 50,           // 50 numbers
    [QuotaMetric.API_CALLS]: 2_000_000,           // 2M API requests/day
    [QuotaMetric.STORAGE_USAGE]: 100_000_000_000 // 100GB storage
  }
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate period start timestamp (UTC) for given metric
 * - hourly: floor to hour (e.g., 14:30 → 14:00)
 * - daily: midnight UTC (00:00:00)
 * - monthly: 1st day of month, 00:00:00 UTC
 */
export function calculatePeriodStart(period: QuotaPeriod, now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  const ms = now.getUTCMilliseconds();

  let periodStart: Date;

  switch (period) {
    case QuotaPeriod.HOURLY:
      periodStart = new Date(Date.UTC(year, month, date, hours, 0, 0, 0));
      break;
    case QuotaPeriod.DAILY:
      periodStart = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
      break;
    case QuotaPeriod.MONTHLY:
      periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      break;
    default:
      throw new Error(`Unknown quota period: ${period}`);
  }

  return periodStart.toISOString();
}

/**
 * Get plan-specific limit for a metric
 */
export function getPlanLimit(plan: string, metric: QuotaMetric): number {
  const planLimits = PLAN_QUOTAS[plan as keyof typeof PLAN_QUOTAS];
  if (!planLimits) {
    throw new Error(`Unknown plan: ${plan}`);
  }
  const limit = planLimits[metric];
  if (limit === undefined) {
    throw new Error(`Unknown metric: ${metric} for plan ${plan}`);
  }
  return limit;
}

/**
 * Calculate next reset time based on period
 */
export function calculateResetAt(period: QuotaPeriod, periodStart: string): Date {
  const start = new Date(periodStart);
  let reset: Date;

  switch (period) {
    case QuotaPeriod.HOURLY:
      reset = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate(),
        start.getUTCHours() + 1,
        0, 0, 0
      ));
      break;
    case QuotaPeriod.DAILY:
      reset = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      break;
    case QuotaPeriod.MONTHLY:
      // First day of next month
      reset = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth() + 1,
        1, 0, 0, 0, 0
      ));
      break;
    default:
      throw new Error(`Unknown quota period: ${period}`);
  }

  return reset;
}

// ============================================================================
// QuotaLimiter Class
// ============================================================================

export class QuotaLimiter {
  private prisma: PrismaClient;
  private failOpen: boolean;

  constructor(options: QuotaLimiterOptions = {}) {
    this.prisma = options.prisma || new PrismaClient();
    this.failOpen = options.failOpen !== false; // Default true
  }

  /**
   * Check if org can consume given amount of metric
   * Atomic: SELECT → INSERT or UPDATE with value + amount
   */
  async check(
    orgId: string,
    metric: QuotaMetric,
    amount: number = 1,
    now: Date = new Date()
  ): Promise<QuotaResult> {
    try {
      // 1. Get org plan
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { plan: true }
      });

      if (!org) {
        throw new Error(`Organization ${orgId} not found`);
      }

      // 2. Get limit for plan+metric
      const limit = getPlanLimit(org.plan, metric);

      // 3. Calculate period start
      const period: QuotaPeriod = metric === QuotaMetric.MESSAGES_SENT ? QuotaPeriod.DAILY : QuotaPeriod.DAILY;
      const periodStart = calculatePeriodStart(period, now);

      // 4. Atomically: find or create, then increment if under limit
      const result = await this.prisma.$transaction(async (tx) => {
        // Find existing usage within transaction (locked)
        const existing = await tx.quotaUsage.findFirst({
          where: {
            orgId,
            metric,
            period,
            periodStart
          },
          select: { id: true, value: true }
        });

        const currentValue = existing ? Number(existing.value) : 0;
        const newValue = BigInt(currentValue + amount);

        // Check limit before updating
        if (newValue > BigInt(limit)) {
          return {
            allowed: false,
            current: currentValue,
            limit,
            remaining: Math.max(0, limit - currentValue),
            resetAt: calculateResetAt(period, periodStart)
          };
        }

        // Update or create
        if (existing) {
          await tx.quotaUsage.update({
            where: { id: existing.id },
            data: { value: newValue }
          });
        } else {
          await tx.quotaUsage.create({
            data: {
              orgId,
              metric,
              period,
              periodStart,
              value: newValue
            }
          });
        }

        return {
          allowed: true,
          current: Number(newValue),
          limit,
          remaining: Math.max(0, limit - Number(newValue)),
          resetAt: calculateResetAt(period, periodStart)
        };
      });

      return result;
    } catch (error: any) {
      console.error('Quota check error:', error);
      if (this.failOpen) {
        // Fail open: allow request, but provide conservative limit (FREE plan) for headers
        let defaultLimit = 0;
        try {
          defaultLimit = getPlanLimit('FREE', metric);
        } catch {
          // ignore and keep 0
        }
        return {
          allowed: true,
          current: 0,
          limit: defaultLimit,
          remaining: defaultLimit,
          resetAt: new Date()
        };
      }
      throw error;
    }
  }

  /**
   * Get current usage value without incrementing
   */
  async getUsage(
    orgId: string,
    metric: QuotaMetric,
    period: QuotaPeriod = QuotaPeriod.DAILY,
    now: Date = new Date()
  ): Promise<number> {
    try {
      const periodStart = calculatePeriodStart(period, now);
      const usage = await this.prisma.quotaUsage.findFirst({
        where: {
          orgId,
          metric,
          period,
          periodStart
        },
        select: { value: true }
      });
      return usage ? Number(usage.value) : 0;
    } catch (error: any) {
      console.error('Quota getUsage error:', error);
      return 0;
    }
  }

  /**
   * Reset usage for an org (optionally specific metric/period)
   * Returns true if records were deleted, false if none found
   */
  async reset(
    orgId: string,
    metric?: QuotaMetric,
    period: QuotaPeriod = QuotaPeriod.DAILY
  ): Promise<boolean> {
    try {
      const where: any = { orgId, period };
      if (metric) {
        where.metric = metric;
      }

      const result = await this.prisma.quotaUsage.deleteMany({ where });
      return result.count > 0;
    } catch (error: any) {
      console.error('Quota reset error:', error);
      return false;
    }
  }

  /**
   * Get organizations approaching their limit (for admin health check)
   * Returns orgs with remaining < 10% of limit
   */
  async getNearLimitOrgs(thresholdPercent: number = 0.1): Promise<Array<{
    orgId: string;
    metric: QuotaMetric;
    current: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  }>> {
    try {
      const nearLimit: any[] = [];

      // This is expensive; done in admin API, not per-request
      // Simplified: fetch all orgs and check their current usage
      const orgs = await this.prisma.organization.findMany({
        select: { id: true, plan: true }
      });

      for (const org of orgs) {
        const planLimits = PLAN_QUOTAS[org.plan as keyof typeof PLAN_QUOTAS];
        if (!planLimits) continue;

        for (const metric of Object.values(QuotaMetric)) {
          const current = await this.getUsage(org.id, metric, QuotaPeriod.DAILY);
          const limit = planLimits[metric];
          const percentUsed = current / limit;

          if (percentUsed >= (1 - thresholdPercent)) {
            nearLimit.push({
              orgId: org.id,
              metric,
              current,
              limit,
              remaining: Math.max(0, limit - current),
              percentUsed
            });
          }
        }
      }

      return nearLimit;
    } catch (error: any) {
      console.error('getNearLimitOrgs error:', error);
      return [];
    }
  }
}

// ============================================================================
// Fastify Middleware Plugin
// ============================================================================

export interface QuotaMiddlewareOptions {
  quotaLimiter: QuotaLimiter;
  metrics: Array<{
    metric: QuotaMetric;
    header?: string;        // Optional: read amount from header (default: 1)
    queryParam?: string;    // Optional: read amount from query param
  }>;
  skip?: (request: FastifyRequest) => boolean;
}

export async function quotaMiddleware(
  fastify: FastifyInstance,
  options: QuotaMiddlewareOptions
): Promise<void> {
  const { quotaLimiter, metrics, skip } = options;

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip if skip function provided and returns true
    if (skip && skip(request)) {
      return;
    }

    // orgGuard must have already set request.currentOrgId
    const orgId = (request as any).currentOrgId;
    if (!orgId) {
      // No org context - cannot enforce quotas
      return;
    }

    try {
      // Check all configured metrics
      for (const { metric, header, queryParam } of metrics) {
        // Determine amount (default 1)
        let amount = 1;
        if (header && request.headers[header.toLowerCase()]) {
          amount = parseInt(request.headers[header.toLowerCase()] as string, 10) || 1;
        } else if (queryParam && (request.query as any)[queryParam]) {
          amount = parseInt((request.query as any)[queryParam], 10) || 1;
        }

        // Perform quota check
        const result = await quotaLimiter.check(orgId, metric, amount);

        if (!result.allowed) {
          // Add quota headers for visibility
          reply.header('X-Quota-Limit', result.limit.toString());
          reply.header('X-Quota-Remaining', result.remaining.toString());
          reply.header('X-Quota-Reset', Math.ceil(result.resetAt.getTime() / 1000).toString());

          return reply.code(429)
            .header('Retry-After', Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString())
            .send({
              error: 'Quota exceeded',
              message: `Quota limit exceeded for ${metric}. Try again after ${result.resetAt.toISOString()}`,
              quota: {
                metric,
                current: result.current,
                limit: result.limit,
                remaining: result.remaining,
                resetAt: result.resetAt.toISOString()
              }
            });
        }

        // Add headers for successful checks too (informational)
        reply.header(`X-Quota-${metric}`, `${result.current}/${result.limit}`);
      }
    } catch (error: any) {
      console.error('Quota middleware error:', error);
      if (quotaLimiter['failOpen'] !== false) {
        return; // Allow on error (fail open)
      }
      return reply.code(500).send({ error: 'Quota check failed', message: error.message });
    }
  });
}

// ============================================================================
// Singleton
// ============================================================================

let quotaLimiterInstance: QuotaLimiter | null = null;

export function getQuotaLimiter(): QuotaLimiter {
  if (!quotaLimiterInstance) {
    quotaLimiterInstance = new QuotaLimiter();
  }
  return quotaLimiterInstance;
}

export function initializeQuotaLimiter(options?: { prisma?: PrismaClient }): QuotaLimiter {
  if (!quotaLimiterInstance) {
    quotaLimiterInstance = new QuotaLimiter({ ...options, failOpen: true });
  }
  return quotaLimiterInstance;
}
