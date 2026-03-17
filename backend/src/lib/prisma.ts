import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Connection pool configuration
const DB_POOL_MIN = parseInt(process.env.DATABASE_POOL_MIN || '2', 10);
const DB_POOL_MAX = parseInt(process.env.DATABASE_POOL_MAX || '20', 10);
const DB_POOL_ACQUIRE_TIMEOUT = parseInt(process.env.DATABASE_POOL_ACQUIRE_TIMEOUT || '10000', 10);
const DB_POOL_IDLE_TIMEOUT = parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000', 10);
const DB_POOL_CONNECTION_TIMEOUT = parseInt(process.env.DATABASE_POOL_CONNECTION_TIMEOUT || '5000', 10);

// Validate configuration
if (DB_POOL_MIN < 0) throw new Error('DATABASE_POOL_MIN must be >= 0');
if (DB_POOL_MAX <= 0) throw new Error('DATABASE_POOL_MAX must be > 0');
if (DB_POOL_MIN > DB_POOL_MAX) throw new Error('DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX');

// Create the PostgreSQL driver adapter with custom pool settings
// Using 'as any' to bypass strict type checks for pool config (runtime config is valid)
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  // Pool options (passed to pg.Pool)
  min: DB_POOL_MIN,
  max: DB_POOL_MAX,
  acquireTimeoutMillis: DB_POOL_ACQUIRE_TIMEOUT,
  idleTimeoutMillis: DB_POOL_IDLE_TIMEOUT,
  // Connection-level timeout
  connectionTimeoutMillis: DB_POOL_CONNECTION_TIMEOUT,
} as any);

export const prisma = new PrismaClient({
  adapter,
  errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
});

// Export singleton for dev mode (hot module replacement)
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

/**
 * Health check for database connectivity.
 */
export async function verifyDatabaseSetup(): Promise<{ ok: boolean; errors?: string[] }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
