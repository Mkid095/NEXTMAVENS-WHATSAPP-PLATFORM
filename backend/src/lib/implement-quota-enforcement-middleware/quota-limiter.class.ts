/**
 * Quota Limiter
 *
 * Core class for checking and incrementing quota usage.
 * Uses atomic database operations to prevent race conditions.
 */

import { PrismaClient } from '@prisma/client';
import type { QuotaLimiterOptions, QuotaResult } from './types';
import { QuotaMetric, QuotaPeriod } from './types';
import { getPlanLimit, calculatePeriodStart, calculateResetAt } from './utils';
import { PLAN_QUOTAS } from './constants';

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
   * Get organizations approaching their limit (admin health check)
   */
  async getNearLimitOrgs(
    thresholdPercent: number = 0.1
  ): Promise<Array<{
    orgId: string;
    metric: QuotaMetric;
    current: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  }>> {
    try {
      const nearLimit: any[] = [];

      // Fetch all orgs with their plans
      const orgs = await this.prisma.organization.findMany({
        select: { id: true, plan: true }
      });

      for (const org of orgs) {
        const planLimits = PLAN_QUOTAS[org.plan as keyof typeof PLAN_QUOTAS];
        if (!planLimits) continue;

        for (const metric of Object.values(QuotaMetric)) {
          const current = await this.getUsage(org.id, metric, QuotaPeriod.DAILY);
          const limit = planLimits[metric];
          const percentUsed = limit > 0 ? current / limit : 0;

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
