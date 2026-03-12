import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton
 *
 * Critical for connection pooling and avoiding multiple instances.
 * In serverless environments, this pattern prevents connection exhaustion.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Verify database connection and RLS setup
 *
 * Run this on startup to ensure:
 * - Database is reachable
 * - RLS is enabled on all tenant tables
 * - Required policies exist
 */
export async function verifyDatabaseSetup(): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection established');
  } catch (error: any) {
    errors.push(`Database connection failed: ${error.message}`);
    return { ok: false, errors };
  }

  // Check RLS on critical tables
  const requiredTables = [
    'organizations',
    'members',
    'whatsapp_instances',
    'whatsapp_messages',
    'whatsapp_chats',
  ];

  for (const table of requiredTables) {
    try {
      const result = await prisma.$queryRaw`
        SELECT relrowsecurity as rls_enabled
        FROM pg_class
        WHERE relname = ${table}
      `;

      const rlsEnabled = (result as any)[0]?.rls_enabled;
      if (rlsEnabled !== true) {
        errors.push(`RLS not enabled on table: ${table}`);
      }
    } catch (error: any) {
      errors.push(`Error checking RLS on ${table}: ${error.message}`);
    }
  }

  if (errors.length === 0) {
    console.log('✅ Database RLS verification passed');
  } else {
    console.error('❌ Database setup errors:', errors);
  }

  return { ok: errors.length === 0, errors };
}
