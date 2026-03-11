/**
 * Unit Tests - Message Deduplication System
 * Tests core deduplication logic: ID generation, config, metrics
 *
 * Uses Node.js native test runner (node:test)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  generateDeduplicationId,
  getDeduplicationConfig,
  buildDeduplicationOptions,
  recordDeduplicationAttempt,
  getDeduplicationMetrics,
  resetMetrics,
  checkPotentialDuplicate,
  createDeduplicationOptions,
  DeduplicationStrategy
} from '../lib/implement-message-deduplication-system';
import { MessageType } from '../lib/message-queue-priority-system/types';

// Helper to reset state before each test
function reset() {
  resetMetrics();
}

describe('Message Deduplication System', () => {
  beforeEach(reset);

  describe('generateDeduplicationId', () => {
    it('should generate consistent ID for identical MESSAGE_UPSERT payloads', () => {
      const payload = {
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        type: 'text',
        content: 'Hello world'
      };

      const id1 = generateDeduplicationId(MessageType.MESSAGE_UPSERT, payload);
      const id2 = generateDeduplicationId(MessageType.MESSAGE_UPSERT, payload);

      assert.strictEqual(id1, id2);
      assert.strictEqual(id1.length, 32);
    });

    it('should generate different IDs for different message content', () => {
      const basePayload = {
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        from: '1234567890@c.us',
        to: '0987654321@c.us',
        type: 'text'
      };

      const id1 = generateDeduplicationId(MessageType.MESSAGE_UPSERT, {
        ...basePayload,
        content: 'Hello'
      });

      const id2 = generateDeduplicationId(MessageType.MESSAGE_UPSERT, {
        ...basePayload,
        content: 'World'
      });

      assert.notStrictEqual(id1, id2);
    });

    it('should use messageId as primary key when available', () => {
      const payload = {
        messageId: 'http://evolution-api.com/message/12345',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001'
      };

      const id = generateDeduplicationId(MessageType.MESSAGE_UPSERT, payload);
      assert.ok(id.length === 32);
    });

    it('should generate different IDs for different orgIds (multi-tenancy)', () => {
      const payload = {
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        content: 'Hello'
      };

      const id1 = generateDeduplicationId(MessageType.MESSAGE_UPSERT, payload);
      const id2 = generateDeduplicationId(MessageType.MESSAGE_UPSERT, {
        ...payload,
        orgId: 'org-002'
      });

      assert.notStrictEqual(id1, id2);
    });

    it('should handle MESSAGE_STATUS_UPDATE', () => {
      const payload = {
        messageId: 'msg-123',
        status: 'delivered',
        instanceId: 'inst-789',
        chatId: 'chat-456',
        orgId: 'org-001'
      };

      const id = generateDeduplicationId(MessageType.MESSAGE_STATUS_UPDATE, payload);
      assert.ok(id.length === 32);
    });

    it('should handle MESSAGE_DELETE', () => {
      const payload = {
        messageId: 'msg-123',
        instanceId: 'inst-789',
        orgId: 'org-001'
      };

      const id = generateDeduplicationId(MessageType.MESSAGE_DELETE, payload);
      assert.ok(id.length === 32);
    });

    it('should handle INSTANCE_STATUS_UPDATE', () => {
      const payload = {
        instanceId: 'inst-789',
        status: 'connected',
        orgId: 'org-001'
      };

      const id = generateDeduplicationId(MessageType.INSTANCE_STATUS_UPDATE, payload);
      assert.ok(id.length === 32);
    });
  });

  describe('getDeduplicationConfig', () => {
    it('should return default config for MESSAGE_UPSERT with throttling enabled', () => {
      const config = getDeduplicationConfig(MessageType.MESSAGE_UPSERT);
      assert.strictEqual(config.enabled, true);
      assert.strictEqual(config.strategy, DeduplicationStrategy.THROTTLE);
      assert.strictEqual(config.ttl, 60 * 60 * 1000); // 1 hour
      assert.strictEqual(config.extend, true);
    });

    it('should return default config for MESSAGE_STATUS_UPDATE with deduplication disabled', () => {
      const config = getDeduplicationConfig(MessageType.MESSAGE_STATUS_UPDATE);
      assert.strictEqual(config.enabled, false);
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        ttl: 30 * 60 * 1000, // 30 minutes
        extend: false
      };

      const config = getDeduplicationConfig(MessageType.MESSAGE_UPSERT, customConfig);
      assert.strictEqual(config.ttl, 30 * 60 * 1000);
      assert.strictEqual(config.extend, false);
      assert.strictEqual(config.strategy, DeduplicationStrategy.THROTTLE); // unchanged
    });

    it('should override strategy with custom one', () => {
      const customConfig = {
        strategy: DeduplicationStrategy.DEBOUNCE,
        delay: 5000
      };

      const config = getDeduplicationConfig(MessageType.MESSAGE_UPSERT, customConfig);
      assert.strictEqual(config.strategy, DeduplicationStrategy.DEBOUNCE);
      assert.strictEqual(config.delay, 5000);
    });
  });

  describe('buildDeduplicationOptions', () => {
    it('should return undefined if deduplication is disabled', () => {
      const config = {
        enabled: false,
        strategy: DeduplicationStrategy.SIMPLE,
        ttl: 5000
      };

      const options = buildDeduplicationOptions(config);
      assert.strictEqual(options, undefined);
    });

    it('should build simple deduplication options', () => {
      const config = {
        enabled: true,
        strategy: DeduplicationStrategy.SIMPLE,
        ttl: 5000
      };

      const options = buildDeduplicationOptions(config);
      assert.ok(options !== undefined);
      assert.deepStrictEqual(options.deduplication, { ttl: 5000 });
      assert.strictEqual(options.extend, undefined);
      assert.strictEqual(options.replace, undefined);
    });

    it('should include extend flag', () => {
      const config = {
        enabled: true,
        strategy: DeduplicationStrategy.THROTTLE,
        ttl: 10000,
        extend: true
      };

      const options = buildDeduplicationOptions(config);
      assert.ok(options);
      assert.strictEqual(options.extend, true);
    });

    it('should include delay and replace for debounce mode', () => {
      const config = {
        enabled: true,
        strategy: DeduplicationStrategy.DEBOUNCE,
        ttl: 5000,
        delay: 3000,
        replace: true,
        extend: true
      };

      const options = buildDeduplicationOptions(config);
      assert.ok(options);
      assert.strictEqual(options.delay, 3000);
      assert.strictEqual(options.replace, true);
      assert.strictEqual(options.extend, true);
    });
  });

  describe('recordDeduplicationAttempt & getDeduplicationMetrics', () => {
    it('should track total jobs and deduplicated count', () => {
      // Record a non-duplicate
      recordDeduplicationAttempt(MessageType.MESSAGE_UPSERT, {
        isDuplicate: false,
        deduplicationId: 'abc123'
      });

      // Record a duplicate
      recordDeduplicationAttempt(MessageType.MESSAGE_UPSERT, {
        isDuplicate: true,
        reason: 'existing_job'
      });

      const metrics = getDeduplicationMetrics();
      assert.strictEqual(metrics.totalJobs, 2);
      assert.strictEqual(metrics.deduplicatedJobs, 1);
      assert.strictEqual(metrics.uniqueJobsAdded, 1);
    });

    it('should track metrics per message type', () => {
      recordDeduplicationAttempt(MessageType.MESSAGE_UPSERT, {
        isDuplicate: false,
        deduplicationId: 'id1'
      });
      recordDeduplicationAttempt(MessageType.MESSAGE_UPSERT, {
        isDuplicate: true,
        deduplicationId: 'id2'
      });
      recordDeduplicationAttempt(MessageType.MESSAGE_STATUS_UPDATE, {
        isDuplicate: false,
        deduplicationId: 'id3'
      });

      const metrics = getDeduplicationMetrics();
      assert.strictEqual(metrics.byMessageType[MessageType.MESSAGE_UPSERT].total, 2);
      assert.strictEqual(metrics.byMessageType[MessageType.MESSAGE_UPSERT].deduplicated, 1);
      assert.strictEqual(metrics.byMessageType[MessageType.MESSAGE_STATUS_UPDATE].total, 1);
      assert.strictEqual(metrics.byMessageType[MessageType.MESSAGE_STATUS_UPDATE].deduplicated, 0);
    });

    it('should reset metrics correctly', () => {
      recordDeduplicationAttempt(MessageType.MESSAGE_UPSERT, {
        isDuplicate: false,
        deduplicationId: 'id1'
      });

      resetMetrics();

      const metrics = getDeduplicationMetrics();
      assert.strictEqual(metrics.totalJobs, 0);
      assert.strictEqual(metrics.deduplicatedJobs, 0);
      assert.strictEqual(metrics.uniqueJobsAdded, 0);

      // Check all types are zeroed
      for (const type of Object.values(MessageType)) {
        assert.strictEqual(metrics.byMessageType[type].total, 0);
        assert.strictEqual(metrics.byMessageType[type].deduplicated, 0);
      }
    });
  });

  describe('checkPotentialDuplicate', () => {
    it('should return deduplication_disabled when config disabled', () => {
      const result = checkPotentialDuplicate(MessageType.MESSAGE_STATUS_UPDATE, {
        messageId: 'msg-123',
        status: 'sent',
        instanceId: 'inst-1',
        chatId: 'chat-1',
        orgId: 'org-1'
      });

      assert.strictEqual(result.isDuplicate, false);
      assert.strictEqual(result.reason, 'deduplication_disabled');
    });

    it('should return deduplicationId for types with deduplication enabled', () => {
      const result = checkPotentialDuplicate(MessageType.MESSAGE_UPSERT, {
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        content: 'Hello'
      });

      assert.ok(result.deduplicationId.length === 32);
      assert.strictEqual(result.reason, 'check_requires_queue_query');
    });
  });

  describe('createDeduplicationOptions', () => {
    it('should return null when deduplication is disabled and not forced', () => {
      const result = createDeduplicationOptions(MessageType.MESSAGE_STATUS_UPDATE, {
        messageId: 'msg-123',
        status: 'sent',
        instanceId: 'inst-1',
        chatId: 'chat-1',
        orgId: 'org-1'
      });

      assert.strictEqual(result, null);
    });

    it('should create deduplication options for MESSAGE_UPSERT', () => {
      const result = createDeduplicationOptions(MessageType.MESSAGE_UPSERT, {
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        content: 'Hello'
      });

      assert.ok(result !== null);
      assert.strictEqual(result!.deduplicationId.length, 32);
      assert.deepStrictEqual(result!.bullmqOptions.deduplication, {
        id: result!.deduplicationId,
        ttl: 60 * 60 * 1000 // 1 hour default
      });
      assert.strictEqual(result!.bullmqOptions.extend, true);
    });

    it('should allow custom TTL via options', () => {
      const result = createDeduplicationOptions(MessageType.MESSAGE_UPSERT, {
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        content: 'Hello'
      }, {
        deduplicationConfig: {
          ttl: 30 * 60 * 1000 // 30 minutes
        }
      });

      assert.strictEqual(result!.bullmqOptions.deduplication.ttl, 30 * 60 * 1000);
    });

    it('should allow forcing deduplication even when disabled', () => {
      const result = createDeduplicationOptions(MessageType.MESSAGE_STATUS_UPDATE, {
        messageId: 'msg-123',
        status: 'sent',
        instanceId: 'inst-1',
        chatId: 'chat-1',
        orgId: 'org-1'
      }, {
        forceDeduplication: true
      });

      assert.ok(result !== null);
    });

    it('should accept custom priority', () => {
      const result = createDeduplicationOptions(MessageType.MESSAGE_UPSERT, {
        messageId: 'msg-123',
        chatId: 'chat-456',
        instanceId: 'inst-789',
        orgId: 'org-001',
        content: 'Hello'
      }, {
        priority: 5
      });

      assert.strictEqual(result!.bullmqOptions.priority, 5);
    });
  });

  describe('Deterministic ID Generation', () => {
    it('should sort object keys before hashing for consistency', () => {
      const payload1 = {
        type: 'text',
        from: '123@c.us',
        to: '456@c.us',
        content: 'Hello',
        orgId: 'org-1',
        instanceId: 'inst-1'
      };

      const payload2 = {
        orgId: 'org-1',
        instanceId: 'inst-1',
        to: '456@c.us',
        content: 'Hello',
        from: '123@c.us',
        type: 'text'
      };

      const id1 = generateDeduplicationId(MessageType.MESSAGE_UPSERT, payload1);
      const id2 = generateDeduplicationId(MessageType.MESSAGE_UPSERT, payload2);

      assert.strictEqual(id1, id2);
    });
  });
});
