/**
 * Chat Pagination System (Cursor-based)
 *
 * Provides efficient pagination for chat message history using keyset pagination.
 * Optimized for large datasets with constant-time queries regardless of page depth.
 *
 * Features:
 * - Cursor-based pagination using (createdAt, id) compound key
 * - Support for both forward (next) and backward (prev) navigation
 * - Opaque cursor encoding (Base64) to prevent client manipulation
 * - Backward-compatible with existing chat message schema
 * - Per-org isolation enforced by caller (RLS)
 *
 * @example
 * const result = await paginateChats(orgId, instanceId, {
 *   limit: 50,
 *   cursor: 'base64EncodedString',
 *   direction: 'next'
 * });
 *
 * // result: { data: Chat[], nextCursor: string|null, prevCursor: string|null, hasMore: boolean }
 */

// Types
export type { ChatCursor, PaginationDirection, ChatPaginationOptions, ChatPage } from './types';

// Cursor utilities
export { encodeCursor, decodeCursor } from './cursor';

// Ordering
export { getOrderBy, reverseItemsIfNeeded } from './order';

// Core pagination
export { paginateChats } from './paginate';

// Helper queries
export { getAllChats, countChats } from './queries';
