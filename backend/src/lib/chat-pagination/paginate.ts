/**
 * Chat Pagination System - Core Pagination Logic
 *
 * Provides keyset-based pagination for chat messages.
 * Uses compound cursor (createdAt + id) for stable, performant queries.
 */

import { PrismaClient } from '@prisma/client';
import { decodeCursor, encodeCursor } from './cursor';
import { getOrderBy, reverseItemsIfNeeded } from './order';
import type { ChatCursor, PaginationDirection, ChatPaginationOptions, ChatPage } from './types';
import { prisma } from '../prisma';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Build WHERE clause for cursor-based pagination.
 * Uses compound key (createdAt, id) for stable ordering.
 *
 * For 'next' (older chats): WHERE (createdAt < lastCreatedAt) OR (createdAt = lastCreatedAt AND id < lastId)
 * For 'prev' (newer chats): WHERE (createdAt > lastCreatedAt) OR (createdAt = lastCreatedAt AND id > lastId)
 */
function buildCursorWhere(
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
 * Paginate chat messages for an organization and instance.
 *
 * Uses keyset pagination with compound cursor (createdAt + id) for O(1) performance
 * regardless of page depth. Supports bidirectional navigation.
 */
export async function paginateChats(
  options: ChatPaginationOptions
): Promise<ChatPage> {
  const {
    orgId,
    instanceId,
    limit = DEFAULT_LIMIT,
    cursor,
    direction = 'next',
    startAfterChatId
  } = options;

  // Validate inputs
  if (!orgId || !instanceId) {
    throw new Error('orgId and instanceId are required');
  }
  if (limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be between 1 and ${MAX_LIMIT}`);
  }

  let whereClause: any = {
    orgId,
    instanceId
  };

  // Add cursor-based WHERE clause if cursor provided
  if (cursor) {
    const decodedCursor = decodeCursor(cursor);
    const cursorWhere = buildCursorWhere(decodedCursor, direction, orgId, instanceId);
    whereClause = { AND: [whereClause, cursorWhere] };
  }

  // If startAfterChatId provided, override cursor logic
  if (startAfterChatId) {
    const referenceChat = await prisma.whatsAppChat.findUnique({
      where: { id: startAfterChatId },
      select: { createdAt: true, id: true }
    });

    if (!referenceChat) {
      throw new Error(`Chat with id ${startAfterChatId} not found`);
    }

    whereClause = {
      orgId,
      instanceId,
      ...(direction === 'next'
        ? {
            OR: [
              { createdAt: { lt: referenceChat.createdAt } },
              {
                AND: [
                  { createdAt: referenceChat.createdAt },
                  { id: { lt: referenceChat.id } }
                ]
              }
            ]
          }
        : {
            OR: [
              { createdAt: { gt: referenceChat.createdAt } },
              {
                AND: [
                  { createdAt: referenceChat.createdAt },
                  { id: { gt: referenceChat.id } }
                ]
              }
            ]
          })
    };
  }

  // Fetch page data with compound ordering
  const orderBy = getOrderBy(direction);
  const items = await prisma.whatsAppChat.findMany({
    where: whereClause,
    take: limit + 1, // Fetch one extra to determine hasMore
    orderBy,
    select: {
      id: true,
      chatId: true,
      orgId: true,
      instanceId: true,
      phone: true,
      name: true,
      avatar: true,
      lastMessageAt: true,
      unreadCount: true,
      isGroup: true,
      isArchived: true,
      isPinned: true,
      metadata: true,
      createdAt: true,
      updatedAt: true
    }
  });

  // Determine if there's a next/prev page
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;

  // Reverse if we used 'prev' direction (since we fetched in ascending order)
  const orderedItems = reverseItemsIfNeeded(pageItems, direction);

  // Build cursors
  const firstItem = orderedItems[0];
  const lastItem = orderedItems[orderedItems.length - 1];

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
    // For 'prev' direction, we also need to check if there's data before this page
    const hasPrevData = direction === 'prev' && hasMore;
    if (hasPrevData) {
      const prevCursorObj: ChatCursor = {
        createdAt: firstItem.createdAt.toISOString(),
        id: firstItem.id
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

  // Refine prev cursor for 'prev' direction when there are newer items
  if (direction === 'prev' && cursor) {
    if (hasMore) {
      const newestItem = orderedItems[orderedItems.length - 1];
      if (newestItem) {
        const prevCursorObj: ChatCursor = {
          createdAt: newestItem.createdAt.toISOString(),
          id: newestItem.id
        };
        prevCursor = encodeCursor(prevCursorObj);
      }
    }
  }

  // For 'next' direction, prevCursor is simply the first item of current page
  if (direction === 'next' && firstItem && !startAfterChatId) {
    const prevCursorObj: ChatCursor = {
      createdAt: firstItem.createdAt.toISOString(),
      id: firstItem.id
    };
    prevCursor = encodeCursor(prevCursorObj);
  }

  return {
    data: orderedItems,
    nextCursor: hasMore ? nextCursor : null,
    prevCursor: prevCursor && (direction === 'prev' ? hasMore : prevCursor !== null) ? prevCursor : null,
    hasMore
  };
}
