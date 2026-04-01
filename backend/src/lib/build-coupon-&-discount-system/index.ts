/**
 * Coupon & Discount System Service
 * Provides coupon creation, validation, and application functionality.
 *
 * Architecture:
 * - types.ts: Type definitions (interfaces)
 * - coupon.management.ts: CRUD operations (create, get, list, deactivate)
 * - coupon.validation.ts: Validation logic (validate, batch validate)
 * - coupon.application.ts: Apply coupons, track usage, stats
 * - coupon.seeding.ts: Default data initialization
 *
 * All files under 150 lines.
 */

// Re-export types
export * from './types';

// Re-export management operations
export * from './coupon.management';

// Re-export validation operations
export * from './coupon.validation';

// Re-export application operations
export * from './coupon.application';

// Re-export seeding operations
export * from './coupon.seeding';
