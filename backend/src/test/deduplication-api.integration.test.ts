/**
 * Integration Tests - Message Deduplication API
 * Tests the REST API endpoints for managing deduplication
 */

/// <reference types="jest" />

import { FastifyInstance } from 'fastify';
import { buildServer } from '../server';
import { MessageType } from '../lib/message-queue-priority-system/types';
import { DEFAULT_DEDUPLICATION_CONFIG } from '../lib/implement-message-deduplication-system';
import { resetMetrics, getDeduplicationMetrics } from '../lib/implement-message-deduplication-system';

describe('Message Deduplication API', () => {
  let server: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    server = await buildServer();
    // Server listens on port defined in PORT env or 3000
    baseUrl = 'http://localhost:3000';
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
  });

  describe('GET /api/deduplication/config', () => {
    it('should return current configuration for all message types', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/config' // The route is mounted at the root level for this plugin
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.config).toBeDefined();
      expect(body.config[MessageType.MESSAGE_UPSERT]).toBeDefined();
      expect(body.config[MessageType.MESSAGE_UPSERT].enabled).toBe(true);
    });
  });

  describe('POST /api/deduplication/config', () => {
    it('should update configuration for a message type', async () => {
      const originalConfig = DEFAULT_DEDUPLICATION_CONFIG[MessageType.MESSAGE_UPSERT];
      const newTtl = 2 * 60 * 60 * 1000; // 2 hours

      const response = await server.inject({
        method: 'POST',
        url: '/config',
        body: {
          messageType: MessageType.MESSAGE_UPSERT,
          config: {
            ttl: newTtl,
            extend: false
          }
        },
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.config.ttl).toBe(newTtl);
      expect(body.config.extend).toBe(false);
    });

    it('should return 404 for unknown message type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/config',
        body: {
          messageType: 'unknown_message_type',
          config: { ttl: 5000 }
        },
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.statusCode).toBe(404);
    });

    it('should validate strategy enum values', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/config',
        body: {
          messageType: MessageType.MESSAGE_UPSERT,
          config: {
            strategy: 'debounce'
          }
        },
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.config.strategy).toBe('debounce');
    });
  });

  describe('GET /api/deduplication/metrics', () => {
    it('should return empty metrics initially', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.metrics).toBeDefined();
      expect(body.metrics.totalJobs).toBe(0);
      expect(body.metrics.deduplicatedJobs).toBe(0);
    });

    it('should include breakdown by message type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.metrics.byMessageType).toBeDefined();
      expect(body.metrics.byMessageType[MessageType.MESSAGE_UPSERT]).toBeDefined();
      expect(body.metrics.byMessageType[MessageType.MESSAGE_UPSERT].total).toBe(0);
    });
  });

  describe('POST /api/deduplication/metrics/reset', () => {
    it('should reset metrics to zero', async () => {
      // First, add some metrics by calling check endpoint
      await server.inject({
        method: 'POST',
        url: '/check',
        body: {
          messageType: MessageType.MESSAGE_UPSERT,
          payload: { test: 'data' }
        },
        headers: { 'Content-Type': 'application/json' }
      });

      // Reset
      const resetResponse = await server.inject({
        method: 'POST',
        url: '/metrics/reset'
      });

      expect(resetResponse.statusCode).toBe(200);

      // Verify reset
      const metricsResponse = await server.inject({
        method: 'GET',
        url: '/metrics'
      });

      const metricsBody = JSON.parse(metricsResponse.body);
      expect(metricsBody.metrics.totalJobs).toBe(0);
    });
  });

  describe('POST /api/deduplication/check', () => {
    it('should return deduplication ID for a message', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/check',
        body: {
          messageType: MessageType.MESSAGE_UPSERT,
          payload: {
            messageId: 'msg-123',
            chatId: 'chat-456',
            instanceId: 'inst-789',
            orgId: 'org-001',
            content: 'Hello world'
          }
        },
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.deduplicationId).toBeDefined();
      expect(body.deduplicationId).toHaveLength(32);
      expect(body.isDuplicate).toBe(false);
      expect(body.note).toContain('BullMQ');
    });

    it('should return deduplication_disabled for types with deduplication off', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/check',
        body: {
          messageType: MessageType.MESSAGE_STATUS_UPDATE,
          payload: {
            messageId: 'msg-123',
            status: 'sent',
            instanceId: 'inst-1',
            chatId: 'chat-1',
            orgId: 'org-1'
          }
        },
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.reason).toBe('deduplication_disabled');
    });
  });

  describe('GET /api/deduplication/health', () => {
    it('should return health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
    });
  });
});
