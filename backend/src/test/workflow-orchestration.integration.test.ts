/**
 * Integration Tests - Workflow Orchestration API
 * Tests REST endpoints and their interactions
 */

/// <reference types="jest" />

import { FastifyInstance } from 'fastify';
import { buildServer } from '../server';
import { WorkflowStatus } from '../lib/workflow-orchestration/types';

// ============================================================================
// Test Data
// ============================================================================

const testWorkflowDefinition = {
  workflowId: 'test-wf-v1',
  name: 'Test Workflow',
  description: 'A comprehensive test workflow',
  steps: [
    {
      name: 'send-welcome',
      action: {
        type: 'message',
        config: {
          to: '+1234567890',
          message: 'Welcome to our service!',
          messageType: 'text',
        },
      },
    },
    {
      name: 'notify-external',
      action: {
        type: 'api-call',
        config: {
          url: 'https://webhook.example.com/workflow',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { event: 'workflow.step.completed' },
        },
      },
    },
    {
      name: 'delay-5s',
      action: {
        type: 'delay',
        config: { delayMs: 5000 },
      },
    },
  ],
  compensation: {
    type: 'sequential',
    steps: [
      {
        name: 'cleanup',
        action: { type: 'custom', config: { handler: 'cleanup' } },
      },
    ],
  },
  timeoutMs: 300000,
  retryPolicy: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    jitterFactor: 0.1,
  },
};

const createWorkflowPayload = {
  workflowId: 'create-test-wf',
  name: 'Create Test Workflow',
  description: 'Created via API test',
  steps: [
    {
      name: 'step1',
      action: {
        type: 'delay',
        config: { delayMs: 1000 },
      },
    },
  ],
  timeoutMs: 60000,
};

const updateWorkflowPayload = {
  name: 'Updated Workflow Name',
  description: 'Updated description',
  timeoutMs: 180000,
};

const startWorkflowPayload = {
  definitionId: 'def-123',
  context: { customerId: 'cust-456', orderId: 'order-789' },
};

// ============================================================================
// Integration Tests
// ============================================================================

describe('Workflow Orchestration API', () => {
  let server: FastifyInstance;
  const basePath = '/admin/workflows';

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Reset any state between tests
  });

  // ==========================================================================
  // Workflow Definition CRUD Tests
  // ==========================================================================

  describe('POST /admin/workflows (Create)', () => {
    it('should create a new workflow definition', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        body: testWorkflowDefinition,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
          // Note: auth would normally be required, but we're testing with mocked middleware
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('workflowId', testWorkflowDefinition.workflowId);
      expect(body.data).toHaveProperty('name', testWorkflowDefinition.name);
      expect(body.data).toHaveProperty('version', 1);
      expect(body.data).toHaveProperty('isActive', true);
      expect(body.data).toHaveProperty('createdAt');
    });

    it('should reject invalid workflow definition', async () => {
      const invalidPayload = {
        workflowId: '',
        name: '',
        steps: [],
      };

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        body: invalidPayload,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Validation error');
    });

    it('should validate message action config', async () => {
      const invalidMessage = {
        workflowId: 'test-wf',
        name: 'Test',
        steps: [
          {
            name: 'bad-message',
            action: {
              type: 'message',
              config: {
                to: '', // Empty required field
                message: 'Hello',
              },
            },
          },
        ],
      };

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        body: invalidMessage,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate api-call action config', async () => {
      const invalidApiCall = {
        workflowId: 'test-wf',
        name: 'Test',
        steps: [
          {
            name: 'bad-api',
            action: {
              type: 'api-call',
              config: {
                url: 'invalid-url', // Not a valid URL
              },
            },
          },
        ],
      };

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        body: invalidApiCall,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate retry policy constraints', async () => {
      const invalidRetry = {
        workflowId: 'test-wf',
        name: 'Test',
        steps: [
          {
            name: 'step1',
            action: { type: 'delay', config: { delayMs: 1000 } },
          },
        ],
        retryPolicy: {
          maxAttempts: -1, // Invalid: negative
          baseDelayMs: 1000,
          maxDelayMs: 60000,
          jitterFactor: 0.1,
        },
      };

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        body: invalidRetry,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /admin/workflows (List)', () => {
    it('should return list of workflow definitions', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${basePath}?limit=10&offset=0`,
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('definitions');
      expect(body.data).toHaveProperty('total');
      expect(Array.isArray(body.data.definitions)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${basePath}?limit=5&offset=0`,
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.definitions.length).toBeLessThanOrEqual(5);
    });

    it('should filter by isActive', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${basePath}?isActive=true`,
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /admin/workflows/:id (Get)', () => {
    it('should return workflow definition by ID', async () => {
      // First create a workflow
      const createResponse = await server.inject({
        method: 'POST',
        url: basePath,
        body: createWorkflowPayload,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const workflowId = createBody.data.id;

      // Now fetch it
      const getResponse = await server.inject({
        method: 'GET',
        url: `${basePath}/${workflowId}`,
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(getResponse.statusCode).toBe(200);
      const getBody = JSON.parse(getResponse.body);
      expect(getBody.success).toBe(true);
      expect(getBody.data).toHaveProperty('id', workflowId);
      expect(getBody.data).toHaveProperty('workflowId', createWorkflowPayload.workflowId);
      expect(getBody.data).toHaveProperty('steps');
      expect(getBody.data.steps).toHaveLength(1);
    });

    it('should return 404 for non-existent workflow', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${basePath}/nonexistent-id`,
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /admin/workflows/:id (Update)', () => {
    it('should update workflow definition', async () => {
      // Create a workflow
      const createResponse = await server.inject({
        method: 'POST',
        url: basePath,
        body: createWorkflowPayload,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const workflowId = createBody.data.id;

      // Update it
      const updateResponse = await server.inject({
        method: 'PUT',
        url: `${basePath}/${workflowId}`,
        body: updateWorkflowPayload,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const updateBody = JSON.parse(updateResponse.body);
      expect(updateBody.success).toBe(true);
      expect(updateBody.data).toHaveProperty('id', workflowId);
      expect(updateBody.data.name).toBe(updateWorkflowPayload.name);
    });

    it('should allow partial updates', async () => {
      const createResponse = await server.inject({
        method: 'POST',
        url: basePath,
        body: createWorkflowPayload,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const workflowId = createBody.data.id;

      const partialUpdate = { timeoutMs: 90000 };
      const response = await server.inject({
        method: 'PUT',
        url: `${basePath}/${workflowId}`,
        body: partialUpdate,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('DELETE /admin/workflows/:id (Delete)', () => {
    it('should soft delete workflow definition', async () => {
      const createResponse = await server.inject({
        method: 'POST',
        url: basePath,
        body: createWorkflowPayload,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const workflowId = createBody.data.id;

      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: `${basePath}/${workflowId}`,
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(deleteResponse.statusCode).toBe(200);
      const deleteBody = JSON.parse(deleteResponse.body);
      expect(deleteBody.success).toBe(true);
      expect(deleteBody.data.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // Workflow Instance Tests
  // ==========================================================================

  describe('POST /admin/workflows/instances (Start)', () => {
    it('should start a new workflow instance', async () => {
      // Create a workflow definition first
      const createResponse = await server.inject({
        method: 'POST',
        url: basePath,
        body: testWorkflowDefinition,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const definitionId = createBody.data.id;

      // Start workflow instance
      const startResponse = await server.inject({
        method: 'POST',
        url: '/admin/workflows/instances',
        body: {
          definitionId,
          context: { test: 'data' },
        },
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startBody = JSON.parse(startResponse.body);
      expect(startBody.success).toBe(true);
      expect(startBody.data).toHaveProperty('instanceId');
      expect(startBody.data).toHaveProperty('status', 'PENDING' || 'RUNNING');
      expect(startBody.data).toHaveProperty('startedAt');
    });

    it('should reject start with invalid definitionId', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/admin/workflows/instances',
        body: {
          definitionId: 'invalid-id',
          context: {},
        },
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(400); // Or 404 depending on implementation
    });

    it('should handle missing x-org-id header', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/admin/workflows/instances',
        body: { definitionId: 'some-id' },
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Missing required header: x-org-id');
    });
  });

  describe('GET /admin/workflows/instances (List)', () => {
    it('should list workflow instances', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/workflows/instances?limit=10',
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('instances');
      expect(body.data).toHaveProperty('total');
      expect(Array.isArray(body.data.instances)).toBe(true);
    });

    it('should filter instances by status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/workflows/instances?status=RUNNING',
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should support pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/workflows/instances?limit=5&offset=0',
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /admin/workflows/instances/:instanceId (Get Status)', () => {
    it('should return workflow instance details', async () => {
      // Start a workflow to get an instance
      const createResponse = await server.inject({
        method: 'POST',
        url: basePath,
        body: testWorkflowDefinition,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const instanceId = (await (await server.inject({
        method: 'POST',
        url: '/admin/workflows/instances',
        body: { definitionId: createBody.data.id },
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      })).json()).data.instanceId;

      // Get instance status
      const response = await server.inject({
        method: 'GET',
        url: `/admin/workflows/instances/${instanceId}`,
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('instanceId', instanceId);
      expect(body.data).toHaveProperty('status');
      expect(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).toContain(body.data.status);
      expect(body.data).toHaveProperty('stepsHistory');
      expect(Array.isArray(body.data.stepsHistory)).toBe(true);
    });

    it('should return 404 for non-existent instance', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/workflows/instances/nonexistent',
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should enforce org isolation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/workflows/instances/some-instance',
        headers: { 'x-org-id': 'org-wrong' },
      });

      // Could be 404 (instance not found) or 403 (access denied)
      expect([403, 404]).toContain(response.statusCode);
    });
  });

  describe('POST /admin/workflows/instances/:instanceId/cancel (Cancel)', () => {
    it('should cancel a running workflow instance', async () => {
      // Create and start workflow
      const createResponse = await server.inject({
        method: 'POST',
        url: basePath,
        body: testWorkflowDefinition,
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const startResponse = await server.inject({
        method: 'POST',
        url: '/admin/workflows/instances',
        body: { definitionId: createBody.data.id },
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });
      const startBody = JSON.parse(startResponse.body);
      const instanceId = startBody.data.instanceId;

      // Cancel the workflow
      const cancelResponse = await server.inject({
        method: 'POST',
        url: `/admin/workflows/instances/${instanceId}/cancel`,
        body: { reason: 'Test cancellation' },
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(cancelResponse.statusCode).toBe(200);
      const cancelBody = JSON.parse(cancelResponse.body);
      expect(cancelBody.success).toBe(true);
      expect(cancelBody.data.status).toBe('cancelled');
    });

    it('should handle cancellation with optional reason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/admin/workflows/instances/fake-id/cancel',
        body: {},
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      // Should still process (even if instance doesn't exist, returns error but no crash)
      expect([200, 400, 404]).toContain(response.statusCode);
    });
  });

  describe('GET /admin/workflows/health (Health Check)', () => {
    it('should return system health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/workflows/health',
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(body.data.status);
    });

    it('should include queue metrics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/workflows/health',
        headers: { 'x-org-id': 'org-test-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveProperty('queue');
      expect(body.data.queue).toHaveProperty('active');
      expect(body.data.queue).toHaveProperty('waiting');
    });
  });

  // ==========================================================================
  // Validation Edge Cases
  // ==========================================================================

  describe('Edge Cases and Validation', () => {
    it('should handle workflow with empty steps array', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        body: {
          workflowId: 'empty-steps',
          name: 'Empty Steps',
          steps: [],
        },
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle long workflowId', async () => {
      const longId = 'a'.repeat(101);
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        body: {
          workflowId: longId,
          name: 'Test',
          steps: [{ name: 's', action: { type: 'delay', config: { delayMs: 1000 } } }],
        },
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle missing compensation gracefully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        body: {
          workflowId: 'no-comp',
          name: 'No Compensation',
          steps: [{ name: 's', action: { type: 'delay', config: { delayMs: 1000 } } }],
        },
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': 'org-test-123',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
