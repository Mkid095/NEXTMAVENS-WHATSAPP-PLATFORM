/**
 * Connection Pool Optimization System
 *
 * Provides health monitoring, leak detection, and metrics collection
 * for the PostgreSQL connection pool used by Prisma.
 *
 * This module assumes prisma.ts has been configured with @prisma/adapter-pg
 * for optimized connection pooling.
 *
 * @module implement-connection-pool-optimization
 */

import { prisma } from '../prisma';

// ============================================================================
// Configuration (Environment Variables with Defaults)
// ============================================================================

export const POOL_CONFIG = {
  min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
  max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
  acquireTimeout: parseInt(process.env.DATABASE_POOL_ACQUIRE_TIMEOUT || '10000', 10),
  idleTimeout: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000', 10),
  connectionTimeout: parseInt(process.env.DATABASE_POOL_CONNECTION_TIMEOUT || '5000', 10),
};

const DB_LEAK_DETECTION_THRESHOLD_MS = parseInt(
  process.env.DATABASE_LEAK_DETECTION_THRESHOLD_MS || '30000',
  10
); // 30s

// Validate configuration (non-fatal)
if (POOL_CONFIG.min < 0) console.warn('[ConnectionPool] DATABASE_POOL_MIN must be >= 0');
if (POOL_CONFIG.max <= 0) console.warn('[ConnectionPool] DATABASE_POOL_MAX must be > 0');
if (POOL_CONFIG.min > POOL_CONFIG.max) console.warn('[ConnectionPool] DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX');

// ============================================================================
// Health Check
// ============================================================================

/**
 * Perform a health check by executing a simple query.
 */
export async function checkPoolHealth(): Promise<{ ok: boolean; error?: string }> {
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const duration = Date.now() - startTime;

    console.log(`[ConnectionPool] Health check passed (${duration}ms)`);
    return { ok: true };
  } catch (error: any) {
    console.error('[ConnectionPool] Health check failed:', error.message);
    return { ok: false, error: error.message };
  }
}

// ============================================================================
// Pool Statistics
// ============================================================================

/**
 * Get current pool statistics by querying pg_stat_activity.
 * Returns actual connections as seen by PostgreSQL.
 */
export async function getConnectionPoolStats(): Promise<{
  total: number;
  idle: number;
  active: number;
  database_wants: number;
  maxConnections: number;
}> {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) as total
      FROM pg_stat_activity
      WHERE datname = (SELECT current_database())
    `;

    // Get max_connections setting
    const maxResult = await prisma.$queryRaw`
      SELECT setting as max_connections
      FROM pg_settings
      WHERE name = 'max_connections'
    `;

    const stats = (result as any[])[0];
    const maxConnSetting = (maxResult as any[])[0];

    return {
      total: Number(stats.total),
      idle: Number(stats.idle),
      active: Number(stats.active),
      database_wants: POOL_CONFIG.max,
      maxConnections: Number(maxConnSetting.max_connections),
    };
  } catch (error: any) {
    console.error('[ConnectionPool] Failed to get pool stats:', error.message);
    throw error;
  }
}

// ============================================================================
// Leak Detection
// ============================================================================

/**
 * Detect potential connection leaks by finding long-running sessions.
 * Returns connections that have been active longer than the threshold.
 */
export async function detectConnectionLeaks(maxAgeMs: number = DB_LEAK_DETECTION_THRESHOLD_MS) {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        pid,
        usename,
        application_name,
        client_addr,
        backend_start,
        state,
        now() - query_start AS query_duration,
        query
      FROM pg_stat_activity
      WHERE datname = (SELECT current_database())
        AND state = 'active'
        AND now() - query_start > interval '${maxAgeMs} milliseconds'::interval
      ORDER BY query_start ASC
    `;

    return (result as any[]).map((row) => ({
      pid: row.pid,
      user: row.usename,
      application: row.application_name,
      client: row.client_addr,
      duration: row.query_duration?.toString() || 'unknown',
      query: row.query?.substring(0, 200) || '',
    }));
  } catch (error: any) {
    console.error('[ConnectionPool] Leak detection failed:', error.message);
    return [];
  }
}

// ============================================================================
// Periodic Health Monitoring (Background Job)
// ============================================================================

/**
 * Run periodic health check and record metrics.
 * Can be called from a background scheduler.
 */
export async function runHealthCheckCycle(): Promise<void> {
  try {
    // Get pool stats
    const stats = await getConnectionPoolStats();

    // Update metrics if they exist
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { register } = require('prom-client');
      const usedMetric = register.getSingleMetric('whatsapp_platform_prisma_connection_pool_used');
      const availMetric = register.getSingleMetric('whatsapp_platform_prisma_connection_pool_available');

      if (usedMetric) usedMetric.set(stats.active);
      if (availMetric) availMetric.set(stats.maxConnections - stats.total);
    } catch {
      // Metrics not yet registered, ignore
    }

    // Check for leaks periodically
    const leaks = await detectConnectionLeaks();
    if (leaks.length > 0) {
      console.warn(`[ConnectionPool] Detected ${leaks.length} potential leaks:`);
      leaks.forEach((leak, i) => {
        console.warn(`  ${i + 1}. PID ${leak.pid}, Duration: ${leak.duration}, Query: ${leak.query?.substring(0, 100)}...`);
      });
    }
  } catch (error: any) {
    console.error('[ConnectionPool] Health check cycle failed:', error.message);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Close all connections and clean up resources.
 * Note: Prisma singleton disconnection is handled separately.
 */
export async function shutdownConnectionPool(): Promise<void> {
  console.log('[ConnectionPool] Shutdown requested (Prisma disconnect handled elsewhere)');
}

export { runHealthCheckCycle };

