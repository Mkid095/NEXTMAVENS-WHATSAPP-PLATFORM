/**
 * Database (Prisma) Metrics
 */

import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * Total database queries executed via Prisma
 */
export const prismaQueriesTotal = new Counter({
  name: 'whatsapp_platform_prisma_queries_total',
  help: 'Total database queries executed via Prisma',
  labelNames: ['operation', 'model'],
});

/**
 * Database query execution time
 */
export const prismaQueryDuration = new Histogram({
  name: 'whatsapp_platform_prisma_query_duration_seconds',
  help: 'Database query execution time',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

/**
 * Total database errors
 */
export const prismaErrorsTotal = new Counter({
  name: 'whatsapp_platform_prisma_errors_total',
  help: 'Total database errors',
  labelNames: ['error_code', 'code_name'],
});

/**
 * Number of active connections in Prisma connection pool
 */
export const prismaConnectionPoolUsed = new Gauge({
  name: 'whatsapp_platform_prisma_connection_pool_used',
  help: 'Number of active connections in Prisma connection pool',
});

/**
 * Number of available connections in Prisma connection pool
 */
export const prismaConnectionPoolAvailable = new Gauge({
  name: 'whatsapp_platform_prisma_connection_pool_available',
  help: 'Number of available connections in Prisma connection pool',
});
