/**
 * Unit Tests: Chat Pagination Pure Functions
 *
 * Tests cursor encoding/decoding, order-by logic, and cursor validation.
 * Does NOT test database operations (see integration tests for full flow).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  encodeCursor,
  decodeCursor,
  getOrderBy,
  type ChatCursor
} from '../lib/chat-pagination';

describe('Chat Pagination - Cursor Encoding/Decoding', () => {
  it('should encode cursor to base64url string', () => {
    const cursor: ChatCursor = {
      createdAt: '2025-03-17T12:00:00.000Z',
      id: 'chat-uuid-12345'
    };
    const encoded = encodeCursor(cursor);
    assert.ok(typeof encoded === 'string');
    assert.ok(encoded.length > 0);
    // base64url should not contain +/=
    assert.ok(!encoded.includes('+'));
    assert.ok(!encoded.includes('/'));
    assert.ok(!encoded.includes('='));
  });

  it('should decode cursor back to original object', () => {
    const original: ChatCursor = {
      createdAt: '2025-03-17T12:00:00.000Z',
      id: 'chat-uuid-12345'
    };
    const encoded = encodeCursor(original);
    const decoded = decodeCursor(encoded);
    assert.deepStrictEqual(decoded, original);
  });

  it('should handle round-trip with UUIDs containing dashes and letters', () => {
    const cursor: ChatCursor = {
      createdAt: '2025-01-01T00:00:00.000Z',
      id: '550e8400-e29b-41d4-a716-446655440000'
    };
    const encoded = encodeCursor(cursor);
    const decoded = decodeCursor(encoded);
    assert.deepStrictEqual(decoded, cursor);
  });

  it('should throw on invalid base64 input', () => {
    assert.throws(() => decodeCursor('not-valid-base64!@#$'), /Invalid cursor format/);
  });

  it('should throw on cursor missing required fields', () => {
    // Missing id
    const invalidJson = Buffer.from(JSON.stringify({ createdAt: '2025-01-01T00:00:00.000Z' })).toString('base64url');
    assert.throws(() => decodeCursor(invalidJson), /missing fields/);
  });

  it('should throw on cursor with empty createdAt', () => {
    const invalid = Buffer.from(JSON.stringify({ createdAt: '', id: 'abc' })).toString('base64url');
    assert.throws(() => decodeCursor(invalid), /missing fields/);
  });
});

describe('Chat Pagination - Order By Direction', () => {
  it('should return DESC order for next (pagination toward older)', () => {
    const order = getOrderBy('next');
    assert.deepStrictEqual(order, [{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('should return ASC order for prev (pagination toward newer)', () => {
    const order = getOrderBy('prev');
    assert.deepStrictEqual(order, [{ createdAt: 'asc' }, { id: 'asc' }]);
  });
});

describe('Chat Pagination - Cursor Validation', () => {
  it('should accept valid ISO 8601 timestamps', () => {
    const cursor: ChatCursor = {
      createdAt: '2025-03-17T12:34:56.789Z',
      id: 'valid-uuid'
    };
    const encoded = encodeCursor(cursor);
    const decoded = decodeCursor(encoded);
    assert.strictEqual(decoded.createdAt, cursor.createdAt);
  });

  it('should handle timestamps with milliseconds', () => {
    const cursor: ChatCursor = {
      createdAt: '2025-03-17T12:00:00.123Z',
      id: 'another-uuid'
    };
    const encoded = encodeCursor(cursor);
    const decoded = decodeCursor(encoded);
    assert.strictEqual(decoded.createdAt, '2025-03-17T12:00:00.123Z');
  });
});
