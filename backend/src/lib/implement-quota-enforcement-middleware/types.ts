/**
 * Quota Enforcement Types
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { QuotaLimiter } from './quota-limiter.class';

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

export interface QuotaMiddlewareOptions {
  quotaLimiter: QuotaLimiter;
  metrics: Array<{
    metric: QuotaMetric;
    header?: string;        // Optional: read amount from header (default: 1)
    queryParam?: string;    // Optional: read amount from query param
  }>;
  skip?: (request: FastifyRequest) => boolean;
}
