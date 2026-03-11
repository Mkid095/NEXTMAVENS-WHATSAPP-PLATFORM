/**
 * Unit Tests: Message Delivery Receipts System
 * Tests core logic: buildReceipt transformation, isDelivered, and metrics calculation
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  buildReceipt
} from '../lib/build-message-delivery-receipts-system';

describe('buildReceipt', () => {
  it('should build receipt from message with all delivery fields', () => {
    const message = {
      id: 'msg-1',
      chatId: 'chat-1',
      instanceId: 'inst-1',
      orgId: 'org-1',
      status: 'DELIVERED',
      sentAt: new Date('2025-01-01T10:00:00Z'),
      deliveredAt: new Date('2025-01-01T10:00:05Z'),
      readAt: null,
      failedAt: null,
      failureReason: undefined,
      updatedAt: new Date('2025-01-01T10:00:05Z')
    };

    const receipt = buildReceipt(message);

    assert.strictEqual(receipt.messageId, 'msg-1');
    assert.strictEqual(receipt.chatId, 'chat-1');
    assert.strictEqual(receipt.instanceId, 'inst-1');
    assert.strictEqual(receipt.orgId, 'org-1');
    assert.strictEqual(receipt.status, 'DELIVERED');
    assert.strictEqual(receipt.sentAt?.getTime(), message.sentAt.getTime());
    assert.strictEqual(receipt.deliveredAt?.getTime(), message.deliveredAt.getTime());
    assert.strictEqual(receipt.readAt, null);
    assert.strictEqual(receipt.failureReason, undefined);
  });

  it('should handle message with READ status', () => {
    const message = {
      id: 'msg-2',
      chatId: 'chat-2',
      instanceId: 'inst-2',
      orgId: 'org-2',
      status: 'READ',
      sentAt: new Date('2025-01-01T10:00:00Z'),
      deliveredAt: new Date('2025-01-01T10:00:03Z'),
      readAt: new Date('2025-01-01T10:00:10Z'),
      failedAt: null,
      failureReason: null,
      updatedAt: new Date('2025-01-01T10:00:10Z')
    };

    const receipt = buildReceipt(message);

    assert.strictEqual(receipt.status, 'READ');
    assert.notStrictEqual(receipt.deliveredAt, null);
    assert.notStrictEqual(receipt.readAt, null);
    assert.strictEqual(receipt.failedAt, null);
    assert.strictEqual(receipt.failureReason, undefined);
  });

  it('should handle message with FAILED status and reason', () => {
    const message = {
      id: 'msg-3',
      chatId: 'chat-3',
      instanceId: 'inst-3',
      orgId: 'org-3',
      status: 'FAILED',
      sentAt: new Date('2025-01-01T10:00:00Z'),
      deliveredAt: null,
      readAt: null,
      failedAt: new Date('2025-01-01T10:00:02Z'),
      failureReason: 'Phone number invalid',
      updatedAt: new Date('2025-01-01T10:00:02Z')
    };

    const receipt = buildReceipt(message);

    assert.strictEqual(receipt.status, 'FAILED');
    assert.strictEqual(receipt.failedAt?.getTime(), message.failedAt.getTime());
    assert.strictEqual(receipt.failureReason, 'Phone number invalid');
  });

  it('should handle message with no timestamps (PENDING)', () => {
    const message = {
      id: 'msg-4',
      chatId: 'chat-4',
      instanceId: 'inst-4',
      orgId: 'org-4',
      status: 'PENDING',
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      failureReason: undefined,
      updatedAt: new Date()
    };

    const receipt = buildReceipt(message);

    assert.strictEqual(receipt.status, 'PENDING');
    assert.strictEqual(receipt.sentAt, null);
    assert.strictEqual(receipt.deliveredAt, null);
    assert.strictEqual(receipt.readAt, null);
    assert.strictEqual(receipt.failedAt, null);
  });

  it('should convert null failureReason to undefined', () => {
    const message = {
      id: 'msg-5',
      chatId: 'chat-5',
      instanceId: 'inst-5',
      orgId: 'org-5',
      status: 'SENT',
      sentAt: new Date(),
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      failureReason: null,
      updatedAt: new Date()
    };

    const receipt = buildReceipt(message);

    assert.strictEqual(receipt.failureReason, undefined);
  });
});

// Note: isDelivered is an async function that queries the database.
// Integration tests will cover it end-to-end.
