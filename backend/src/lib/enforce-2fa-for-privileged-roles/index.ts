/**
 * 2FA Enforcement System for Privileged Roles
 *
 * Provides TOTP-based two-factor authentication for users with
 * privileged roles (SUPER_ADMIN, ORG_ADMIN). Enforces 2FA requirement
 * for all privileged operations.
 *
 * Features:
 * - TOTP secret generation and management
 * - QR code creation for authenticator apps
 * - Token verification with clock drift tolerance
 * - Middleware enforcement for privileged roles
 *
 * Architecture:
 * - types.ts: Type definitions, interfaces, and constants
 * - core.service.ts: Setup generation and enable/disable operations
 * - verification.service.ts: Token verification and status queries
 * - middleware.ts: Fastify middleware for 2FA enforcement
 * - utils.ts: Utility functions (backup codes, token validation)
 * - audit.ts: Audit logging helpers
 *
 * All files under 150 lines.
 */

// Re-export types
export * from './types';

// Re-export core service (setup operations)
export * from './core.service';

// Re-export verification service (token checks and status queries)
export * from './verification.service';

// Re-export middleware
export * from './middleware';

// Re-export utilities
export * from './utils';

// Re-export audit logging
export * from './audit';
