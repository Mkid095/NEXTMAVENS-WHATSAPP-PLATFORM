/**
 * Chat Pagination - Helper Functions
 * Extracted logic for cursor building and where clause generation
 */

import { encodeCursor } from './cursor';
import type { ChatCursor, PaginationDirection } from './types';

/**
 * Build WHERE clause for cursor-based pagination.
 * Uses compound key (createdAt + id) for stable ordering.
 */
export function buildCursorWhere(
  cursor: ChatCursor,
  direction: PaginationDirection,
  orgId: string,
  instanceId: string
): any {
  const { createdAt, id } = cursor;

  if (direction === 'next') {
    return {
      orgId,
      instanceId,
      OR: [
        { createdAt: { lt: new Date(createdAt) } },
        {
          AND: [
            { createdAt: new Date(createdAt) },
            { id: { lt: id } }
          ]
        }
      ]
    };
  } else {
    return {
      orgId,
      instanceId,
      OR: [
        { createdAt: { gt: new Date(createdAt) } },
        {
          AND: [
            { createdAt: new Date(createdAt) },
            { id: { gt: id } }
          ]
        }
      ]
    };
  }
}

/**
 * Build where clause based on startAfterChatId
 */
export function buildStartAfterWhere(
  startAfterChatId: string,
  direction: PaginationDirection,
  orgId: string,
  instanceId: string,
  referenceChat: { createdAt: Date; id: string }
): any {
  if (direction === 'next') {
    return {
      orgId,
      instanceId,
      OR: [
        { createdAt: { lt: referenceChat.createdAt } },
        {
          AND: [
            { createdAt: referenceChat.createdAt },
            { id: { lt: referenceChat.id } }
          ]
        }
      ]
    };
  } else {
    return {
      orgId,
      instanceId,
      OR: [
        { createdAt: { gt: referenceChat.createdAt } },
        {
          AND: [
            { createdAt: referenceChat.createdAt },
            { id: { gt: referenceChat.id } }
          ]
        }
      ]
    };
  }
}

/**
 * Build next and previous cursors for pagination response
 */
export function buildCursors(
  orderedItems: any[],
  direction: PaginationDirection,
  cursor: string | undefined,
  startAfterChatId: string | undefined,
  hasMore: boolean
): { nextCursor: string | null; prevCursor: string | null } {
  const firstItem = orderedItems[0];
  const lastItem = orderedItems[orderedItems.length - 1];
  const newest = orderedItems[orderedItems.length - 1];

  let nextCursor: string | null = null;
  let prevCursor: string | null = null;

  if (hasMore && lastItem) {
    const nextCursorObj: ChatCursor = {
      createdAt: lastItem.createdAt.toISOString(),
      id: lastItem.id
    };
    nextCursor = encodeCursor(nextCursorObj);
  }

  if (firstItem) {
    if (direction === 'prev' && hasMore) {
      const prevCursorObj: ChatCursor = {
        createdAt: newest.createdAt.toISOString(),
        id: newest.id
      };
      prevCursor = encodeCursor(prevCursorObj);
    } else if (direction === 'next' && cursor) {
      const prevCursorObj: ChatCursor = {
        createdAt: firstItem.createdAt.toISOString(),
        id: firstItem.id
      };
      prevCursor = encodeCursor(prevCursorObj);
    }
  }

  if (direction === 'prev' && cursor) {
    if (hasMore) {
      const prevCursorObj: ChatCursor = {
        createdAt: newest.createdAt.toISOString(),
        id: newest.id
      };
      prevCursor = encodeCursor(prevCursorObj);
    }
  }

  if (direction === 'next' && firstItem && !startAfterChatId) {
    const prevCursorObj: ChatCursor = {
      createdAt: firstItem.createdAt.toISOString(),
      id: firstItem.id
    };
    prevCursor = encodeCursor(prevCursorObj);
  }

  return { nextCursor, prevCursor };
}
