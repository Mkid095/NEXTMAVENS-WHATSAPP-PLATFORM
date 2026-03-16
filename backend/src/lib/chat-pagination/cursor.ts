/**
 * Chat Pagination System - Cursor Utilities
 *
 * Provides encoding and decoding of opaque pagination cursors.
 */

import type { ChatCursor } from './types';

/**
 * Encode a cursor object into an opaque Base64 string.
 * This prevents clients from manipulating cursor internals and ensures
 * the cursor can be safely passed via query parameters.
 *
 * @param cursor - The cursor data to encode
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(cursor: ChatCursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json).toString('base64url');
}

/**
 * Decode an opaque cursor string back to its constituent parts.
 * Validates that the cursor contains required fields and proper ISO timestamp.
 *
 * @param encoded - Base64-encoded cursor string
 * @returns Decoded cursor object
 * @throws {Error} If cursor format is invalid or missing required fields
 */
export function decodeCursor(encoded: string): ChatCursor {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf-8');
    const cursor = JSON.parse(json) as ChatCursor;

    if (!cursor.createdAt || !cursor.id) {
      throw new Error('Invalid cursor: missing fields');
    }

    // Validate timestamp format
    const date = new Date(cursor.createdAt);
    if (date.toString() === 'Invalid Date') {
      throw new Error('Invalid cursor: invalid createdAt');
    }

    return cursor;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('missing fields')) {
      throw error;
    }
    throw new Error('Invalid cursor format');
  }
}
