/**
 * Chat Pagination System - Ordering Logic
 *
 * Handles sorting order for pagination queries and item reversal.
 */

import type { PaginationDirection } from './types';

/**
 * Determine the ORDER BY clause for a pagination query.
 * Prisma requires an array of order objects for compound ordering.
 *
 * For 'next' (forward pagination), we want older messages → DESC order.
 * For 'prev' (backward pagination), we want newer messages → ASC order.
 *
 * @param direction - Pagination direction
 * @returns Array of order by specifications compatible with Prisma
 */
export function getOrderBy(direction: PaginationDirection): any[] {
  if (direction === 'next') {
    return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
  return [{ createdAt: 'asc' }, { id: 'asc' }];
}

/**
 * Reverse the order of items if the direction was 'prev'.
 * When fetching backwards, we query in ascending order to use > comparisons,
 * but the result should be returned in descending (newest first) order.
 *
 * @param items - Array of items fetched from database
 * @param direction - Pagination direction
 * @returns Items in correct display order
 */
export function reverseItemsIfNeeded<T>(items: T[], direction: PaginationDirection): T[] {
  if (direction === 'prev') {
    return [...items].reverse();
  }
  return items;
}
