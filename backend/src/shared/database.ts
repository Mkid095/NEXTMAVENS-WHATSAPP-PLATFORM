/**
 * Prisma Database Client Singleton
 *
 * Provides a single Prisma instance shared across the application.
 * Uses transaction manager for proper connection handling.
 */

import { PrismaClient } from '@prisma/client';

const GLOBAL_PRISMA_KEY = '__GLOBAL_PRISMA_CLIENT__';

declare global {
  var prisma: PrismaClient | undefined;
}

export function getPrisma(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    // In production, use global singleton to avoid creating multiple connections
    if (!global[GLOBAL_PRISMA_KEY]) {
      global[GLOBAL_PRISMA_KEY] = new PrismaClient({
        log: ['error', 'warn'],
      });
    }
    return global[GLOBAL_PRISMA_KEY];
  }

  // In development/test, create a new instance to avoid state leakage
  return new PrismaClient({
    log: ['query', 'error', 'warn'],
  });
}

// Singleton instance for convenience
let prismaInstance: PrismaClient | null = null;

export function getPrismaSingleton(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = getPrisma();
  }
  return prismaInstance;
}

export async function disconnectDatabase(): Promise<void> {
  if (global[GLOBAL_PRISMA_KEY]) {
    await global[GLOBAL_PRISMA_KEY].$disconnect();
    delete global[GLOBAL_PRISMA_KEY];
    prismaInstance = null;
  }
}

// Export singleton instance for direct import
export const prisma = getPrismaSingleton();
