import 'fastify';

/**
 * Extend Fastify's Request type to include our custom properties
 * These are set by middleware (auth, orgGuard)
 */
declare module 'fastify' {
  interface FastifyRequest {
    /**
     * User information set by auth middleware
     */
    user?: {
      id: string;
      email: string;
      name?: string | null;
      role: string;
      isActive: boolean;
      orgId?: string;
    } | null;

    /**
     * Current organization ID set by orgGuard
     */
    currentOrgId?: string | null;

    /**
     * Member's role in the current organization
     */
    memberRole?: string;
  }
}

/**
 * Ensure FastifyBaseLogger has standard pino methods
 * Fastify already includes these, but we redeclare to satisfy TypeScript
 */
declare module 'fastify' {
  interface FastifyBaseLogger {
    info(message: string | object | Record<string, unknown>, ...args: unknown[]): void;
    error(message: string | object | Record<string, unknown>, ...args: unknown[]): void;
  }
}
