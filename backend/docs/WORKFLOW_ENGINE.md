# Workflow Engine - Technical Documentation

## Overview

The Workflow Engine (Phase 3 Step 3) provides async flow orchestration for complex, multi-step business processes. It enables defining, executing, and monitoring workflows with:

- **Priority-based execution** via BullMQ
- **Retry policies** with exponential backoff and jitter
- **Compensation rollback** on failure or cancellation
- **Real-time monitoring** via WebSocket events
- **Full audit trail** through step history
- **Multi-tenant isolation** by orgId

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin API (Fastify)                     │
│  POST /admin/workflows          Create workflow definition  │
│  GET  /admin/workflows          List definitions           │
│  PUT  /admin/workflows/:id      Update definition         │
│  DELETE/admin/workflows/:id     Soft delete              │
│  POST /admin/workflows/instances Start workflow instance │
│  GET  /admin/workflows/instances List instances          │
│  POST /admin/workflows/instances/:id/cancel Cancel       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Workflow Orchestration Library                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Workflow Definition CRUD (index.ts)                  │  │
│  │   - createWorkflowDefinition()                       │  │
│  │   - updateWorkflowDefinition()                       │  │
│  │   - getWorkflowDefinition()                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Workflow Engine (engine.ts)                          │  │
│  │   - createWorkflowInstance()                         │  │
│  │   - advanceStep()                                    │  │
│  │   - failWorkflow()                                   │  │
│  │   - cancelWorkflow()                                 │  │
│  │   - compensateWorkflow()                             │  │
│  │   - checkWorkflowHealth()                            │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Retry Policy (retry-policy.ts)                       │  │
│  │   - calculateRetryDelay()                            │  │
│  │   - shouldRetry()                                    │  │
│  │   - classifyError()                                  │  │
│  │   - resolveRetryPolicy()                             │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Queue Integration (queue.ts)                         │  │
│  │   - enqueueWorkflowStep()                            │  │
│  │   - getWorkflowQueueMetrics()                        │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┘  │
│  │ Processor (processor.ts)                              │
│  │   BullMQ worker callback for step execution           │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Compensation (compensation.ts)                       │  │
│  │   - runCompensation()                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     BullMQ Queue                          │
│              (priority-based job processing)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ WorkflowDefinition                                  │  │
│  │   - workflowId (unique)                             │  │
│  │   - name, description, stepsJson, compensationJson │  │
│  │   - retryPolicyJson, timeoutMs, isActive           │  │
│  │   - createdBy, createdAt, updatedAt                │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ WorkflowInstance                                    │  │
│  │   - instanceId (unique)                             │  │
│  │   - definitionId (FK)                               │  │
│  │   - status (enum), currentStep                      │  │
│  │   - contextJson, orgId                              │  │
│  │   - startedAt, completedAt, failedAt                │  │
│  │   - lastHeartbeatAt, failureReason                  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ WorkflowStepHistory                                 │  │
│  │   - instanceId (FK), stepIndex                      │  │
│  │   - stepName, status (enum)                         │  │
│  │   - startedAt, completedAt, failedAt                │  │
│  │   - inputJson, outputJson, metadata, errorMessage   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### WorkflowDefinition

Stores the static configuration of a workflow.

```prisma
model WorkflowDefinition {
  id               String   @id @default(cuid())
  workflowId       String   @unique
  name             String
  description      String?
  stepsJson        Json     // Array<WorkflowStep>
  compensationJson Json?    // { type: 'sequential'|'parallel', steps: WorkflowStep[] }
  timeoutMs        Int?
  retryPolicyJson  Json?    // RetryPolicy
  isActive         Boolean  @default(true)
  createdBy        String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  instances        WorkflowInstance[]
}
```

### WorkflowInstance

Represents a single execution of a workflow.

```prisma
model WorkflowInstance {
  id               String          @id @default(cuid())
  instanceId       String          @unique
  definitionId     String
  definition       WorkflowDefinition @relation(fields: [definitionId], references: [id])
  status           WorkflowStatus
  currentStep      Int?
  contextJson      Json            // Runtime context (mutable)
  startedAt        DateTime        @default(now())
  completedAt      DateTime?
  failedAt         DateTime?
  failureReason    String?
  lastHeartbeatAt  DateTime?
  orgId            String

  stepsHistory     WorkflowStepHistory[]
}
```

### WorkflowStepHistory

Audit trail for each step execution in a workflow instance.

```prisma
model WorkflowStepHistory {
  id         String          @id @default(cuid())
  instanceId String
  instance   WorkflowInstance @relation(fields: [instanceId], references: [id])
  stepIndex  Int
  stepName   String
  status     WorkflowStepStatus
  startedAt  DateTime
  completedAt DateTime?
  failedAt   DateTime?
  inputJson  Json?
  outputJson Json?
  metadata   Json?

  @@unique([instanceId, stepIndex])
  @@index([instanceId])
}
```

## Workflow Definition Format

### Step Action Types

The workflow engine supports 6 action types:

#### 1. `message`

Sends a WhatsApp message via the existing message queue system.

**Config Schema:**

```typescript
{
  to: string,              // Required: phone number with country code
  message: any,            // Required: message content (string or object based on messageType)
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template' // Default: 'text'
}
```

**Example:**

```json
{
  "name": "send-welcome",
  "action": {
    "type": "message",
    "config": {
      "to": "+1234567890",
      "message": "Welcome to our service!",
      "messageType": "text"
    }
  }
}
```

#### 2. `api-call`

Makes an HTTP API call.

**Config Schema:**

```typescript
{
  url: string,             // Required: target URL
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', // Default: 'POST'
  headers?: Record<string, string>,  // Optional HTTP headers
  body?: any               // Optional request body (serialized as JSON)
}
```

**Example:**

```json
{
  "name": "notify-crm",
  "action": {
    "type": "api-call",
    "config": {
      "url": "https://api.example.com/crm/contacts",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer <token>",
        "Content-Type": "application/json"
      },
      "body": {
        "event": "customer.subscribed",
        "customerId": "{{context.customerId}}"
      }
    }
  }
}
```

#### 3. `queue-job`

Enqueues a generic job onto the message queue for any MessageType.

**Config Schema:**

```typescript
{
  jobType: 'MESSAGE_UPSERT' | 'MESSAGE_STATUS_UPDATE' | 'INSTANCE_STATUS_UPDATE' | 'ANALYTICS_EVENT',
  payload: Record<string, unknown>  // Job-specific payload
}
```

**Example:**

```json
{
  "name": "track-analytics",
  "action": {
    "type": "queue-job",
    "config": {
      "jobType": "ANALYTICS_EVENT",
      "payload": {
        "event": "workflow.completed",
        "workflowId": "{{workflowId}}",
        "instanceId": "{{instanceId}}"
      }
    }
  }
}
```

#### 4. `delay`

Pauses execution for a specified duration.

**Config Schema:**

```typescript
{
  delayMs: number  // Required: delay in milliseconds
}
```

**Example:**

```json
{
  "name": "wait-24-hours",
  "action": {
    "type": "delay",
    "config": {
      "delayMs": 86400000
    }
  }
}
```

#### 5. `custom`

Executes a custom handler registered in the system. This is a placeholder for extensibility.

**Config Schema:**

```typescript
{
  handler: string,  // Required: handler name
  params?: Record<string, unknown>  // Optional parameters
}
```

**Example:**

```json
{
  "name": "run-custom-validation",
  "action": {
    "type": "custom",
    "config": {
      "handler": "validate-payment-method",
      "params": {
        "require3ds": true
      }
    }
  }
}
```

#### 6. `parallel`

**Status:** Not yet implemented. Reserved for future use where multiple steps can execute concurrently.

### Step Properties

All steps support the following optional properties:

```typescript
{
  name: string,                    // Required: unique within workflow (max 200 chars)
  description?: string,            // Optional: human-readable description
  action: { type: string, config: Record<string, unknown> }, // Required
  priority?: 'low' | 'normal' | 'high' | 'critical',  // Default: 'normal'
  timeoutMs?: number,              // Step-level timeout (overrides workflow default)
  retryPolicy?: RetryPolicy,       // Step-specific retry policy
  compensation?: {                 // Rollback action for this step
    type: 'reverse' | 'custom',
    action: { type: string, config: Record<string, unknown> }
  },
  optional?: boolean,              // Skip if previous step failed
  condition?: {                    // Conditional execution
    expression: string  // e.g., "context.data.type === 'marketing'"
  }
}
```

### Retry Policy

Retry policies control how failed steps are retried.

**Schema:**

```typescript
interface RetryPolicy {
  maxAttempts: number;     // Maximum retry attempts (>= 1)
  baseDelayMs: number;     // Initial backoff delay in milliseconds (>= 0)
  maxDelayMs: number;      // Maximum backoff ceiling (>= 1)
  jitterFactor: number;    // Randomization factor 0-1 (inclusive)
}
```

**Default Policies by Action Type:**

| Action Type | Max Attempts | Base Delay | Max Delay | Jitter |
|-------------|--------------|------------|-----------|--------|
| `send-message` | 5 | 1s | 5m | 0.15 |
| `send-template` | 5 | 1s | 5m | 0.15 |
| `api-call` | 3 | 2s | 2m | 0.1 |
| `default` | 2 | 1s | 30s | 0.1 |

The exponential backoff formula:
```
delay = min(baseDelay * 2^(attempt-1) * (1 + random * jitter), maxDelay)
```

### Compensation

Compensation defines rollback steps to execute when a workflow fails or is cancelled.

#### Workflow-Level Compensation

```json
{
  "compensation": {
    "type": "sequential" | "parallel",
    "steps": [
      {
        "name": "cleanup-database",
        "action": {
          "type": "custom",
          "config": { "handler": "undo-changes" }
        }
      },
      {
        "name": "send-notification",
        "action": {
          "type": "message",
          "config": { "to": "+1234567890", "message": "Process cancelled" }
        }
      }
    ]
  }
}
```

- `sequential`: Compensation steps execute in reverse order (last-in-first-out)
- `parallel`: All compensation steps execute concurrently (future)

#### Step-Level Compensation

Individual steps can define their own compensation:

```json
{
  "name": "charge-credit-card",
  "action": { "type": "api-call", "config": { "url": "...", ... } },
  "compensation": {
    "type": "reverse",  // Always runs the compensation action
    "action": {
      "type": "api-call",
      "config": {
        "url": "https://api.payments/refund",
        "method": "POST",
        "body": { "transactionId": "{{output.transactionId}}" }
      }
    }
  }
}
```

**Important:** Compensation steps run in a separate workflow execution context and can access:
- The original step's `outputJson` via `{{output.<field>}}` template variables
- The workflow's `context` via `{{context.<field>}}`

### Workflow-Level Configuration

```typescript
interface WorkflowDefinition {
  workflowId: string;                    // Unique identifier (max 100 chars)
  name: string;                          // Human-readable name (max 200 chars)
  description?: string;                  // Optional description
  steps: WorkflowStep[];                 // Required: at least 1 step
  compensation?: {                       // Optional: rollback definition
    type: 'sequential' | 'parallel';
    steps: WorkflowStep[];
  }
  timeoutMs?: number;                    // Optional: total workflow timeout
  retryPolicy?: RetryPolicy;             // Optional: default retry for all steps
  // isActive, createdBy, timestamps: managed by system
}
```

## Admin API Reference

All endpoints require `SUPER_ADMIN` role and `x-org-id` header.

### Create Workflow Definition

```
POST /admin/workflows
Content-Type: application/json

{
  "workflowId": "order-fulfillment-v1",
  "name": "Order Fulfillment",
  "description": "Processes new orders",
  "steps": [...],
  "compensation": { ... },
  "timeoutMs": 300000,
  "retryPolicy": { "maxAttempts": 3, "baseDelayMs": 1000, "maxDelayMs": 60000, "jitterFactor": 0.1 }
}

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "wfd_abc123",
    "workflowId": "order-fulfillment-v1",
    "name": "Order Fulfillment",
    "version": 1,
    "isActive": true,
    "createdAt": "2025-03-17T12:00:00.000Z"
  }
}
```

### List Workflow Definitions

```
GET /admin/workflows?limit=50&offset=0&isActive=true&search=order

Response: 200 OK
{
  "success": true,
  "data": {
    "definitions": [
      { id, workflowId, name, description, version, isActive, stepCount, createdAt, updatedAt }
    ],
    "total": 1
  }
}
```

### Get Workflow Definition

```
GET /admin/workflows/:id

Response: 200 OK
{
  "success": true,
  "data": {
    id, workflowId, name, description, version,
    steps, compensation, timeoutMs, retryPolicy,
    isActive, createdBy, createdAt, updatedAt
  }
}
```

### Update Workflow Definition

```
PUT /admin/workflows/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  "steps": [...],     // Can update steps
  "timeoutMs": 180000
}

Response: 200 OK
{
  "success": true,
  "data": { id, workflowId, name, version, updatedAt }
}
```

### Start Workflow Instance

```
POST /admin/workflows/instances
Content-Type: application/json

{
  "definitionId": "wfd_abc123",
  "context": { "customerId": "cust_123", "orderId": "ord_456" }
}

Response: 200 OK
{
  "success": true,
  "data": {
    "instanceId": "wf_20250317_123456_abc123",
    "status": "PENDING" | "RUNNING",
    "startedAt": "2025-03-17T12:00:00.000Z",
    "context": { ...initial context... }
  }
}
```

### List Workflow Instances

```
GET /admin/workflows/instances?limit=50&offset=0&definitionId=...&status=RUNNING&orgId=...

Response: 200 OK
{
  "success": true,
  "data": {
    "instances": [
      {
        id, instanceId, status, currentStep,
        startedAt, completedAt, failedAt,
        failureReason, orgId,
        definition: { id, workflowId, name }
      }
    ],
    total, nextOffset
  }
}
```

### Get Workflow Instance Status

```
GET /admin/workflows/instances/:instanceId

Response: 200 OK
{
  "success": true,
  "data": {
    id, instanceId, definitionId, status, currentStep,
    contextJson, startedAt, completedAt, failedAt,
    failureReason, lastHeartbeatAt, orgId,
    stepsHistory: [
      {
        stepIndex, stepName, status,
        startedAt, completedAt, failedAt,
        inputJson, outputJson, metadata
      }
    ]
  }
}
```

### Cancel Workflow Instance

```
POST /admin/workflows/instances/:instanceId/cancel
Content-Type: application/json

{
  "reason": "User requested cancellation"
}

Response: 200 OK
{
  "success": true,
  "data": { instanceId, status: "cancelled" }
}
```

Returns 400 if the workflow is already completed or cannot be cancelled.

### Health Check

```
GET /admin/workflows/health

Response: 200 OK
{
  "success": true,
  "data": {
    "status": "healthy" | "degraded" | "unhealthy",
    "queue": {
      active: number,
      waiting: number,
      completed: number,
      failed: number,
      delayed: number
    },
    "timestamp": "2025-03-17T12:00:00.000Z"
  }
}
```

## Real-Time Events (WebSocket)

The workflow engine emits events via Socket.IO to the `org-<orgId>` room.

### Events

#### `workflow:step:completed`

Emitted when a step completes successfully.

```typescript
{
  instanceId: string,
  workflowId: string,
  stepIndex: number,
  stepName: string,
  duration: number,      // Execution time in seconds
  output: Record<string, unknown>  // Step output
}
```

#### `workflow:step:failed`

Emitted when a step fails permanently (no more retries).

```typescript
{
  instanceId: string,
  workflowId: string,
  stepIndex: number,
  stepName: string,
  error: string,
  retryCount: number,
  final: true
}
```

#### `workflow:instance:updated`

Emitted when instance status changes.

```typescript
{
  instanceId: string,
  workflowId: string,
  status: WorkflowStatus,
  currentStep?: number,
  failureReason?: string
}
```

## Library API (Programmatic Access)

For advanced use cases, import the library directly:

```typescript
import {
  createWorkflowDefinition,
  updateWorkflowDefinition,
  getWorkflowDefinition,
  deleteWorkflowDefinition,
  startWorkflow,
  getWorkflowStatus,
  cancelWorkflow,
  listWorkflowInstances,
  checkWorkflowHealth,
} from '../lib/workflow-orchestration';

// Start a workflow programmatically
const result = await startWorkflow(definitionId, orgId, {
  context: { userId: '123' },
});
console.log('Instance started:', result.instanceId);

// Check status
const status = await getWorkflowStatus(result.instanceId);
console.log('Current step:', status.currentStep);

// Cancel if needed
await cancelWorkflow(result.instanceId, 'Obsolete');
```

## Error Handling

### Step Failures

| Error Type | Classification | Action |
|------------|----------------|--------|
| 5xx HTTP errors | Transient | Automatic retry up to maxAttempts |
| 429 Too Many Requests | Transient | Automatic retry with backoff |
| 4xx (except 429) | Permanent | Fail workflow immediately |
| Validation errors | Permanent | Fail workflow immediately |
| Timeout | Transient | Retry if within limit |
| Network unreachable | Transient | Retry if within limit |
| Database duplicate key (P2002) | Permanent | Fail workflow immediately |

### Workflow Failures

When a workflow fails (step exceeded max retries or permanent error):

1. Step is marked `FAILED` in `WorkflowStepHistory`
2. Workflow instance status is set to `FAILED`
3. If workflow has compensation defined, it is triggered automatically
4. `workflow:step:failed` event is emitted
5. Failure reason is recorded in `WorkflowInstance.failureReason`

### Workflow Cancellation

When a workflow is cancelled:

1. Instance status is set to `CANCELLING` → `CANCELLED`
2. If workflow has compensation, it is triggered
3. Running steps are allowed to complete, but new step jobs are not enqueued
4. `workflow:instance:updated` event is emitted

## Monitoring & Observability

### Prometheus Metrics

The workflow engine exposes the following metrics:

- `whatsapp_platform_workflow_instances_total{status="..."}` - Count of instances by status
- `whatsapp_platform_workflow_steps_completed_total{workflow_id, step_name}` - Completed steps counter
- `whatsapp_platform_workflow_steps_failed_total{workflow_id, step_name, error_category}` - Failed steps counter
- `whatsapp_platform_workflow_compensations_triggered_total{reason}` - Compensation count
- `whatsapp_platform_workflow_duration_seconds{workflow_id}` - Histogram of total duration
- `whatsapp_platform_workflow_step_duration_seconds{workflow_id, step_name}` - Histogram of step duration

These are scraped by the existing Prometheus endpoint `/metrics` (configured in `create-comprehensive-metrics-dashboard-(grafana)`).

### Grafana Dashboard

Import the dashboard JSON from `docs/grafana-workflow-dashboard.json` (to be created) to visualize:
- Workflow success/failure rates
- Step execution times
- Queue depth and processing rates
- Compensation frequency
- Retry patterns

### Health Check Endpoint

```
GET /admin/workflows/health
```

Returns:
- Instance health (stale if last heartbeat > 5 min old)
- Queue metrics (active, waiting, failed jobs)
- Database connectivity status

## Best Practices

### Design Workflows to be Idempotent

Steps may be retried automatically. Design actions so that running them multiple times does not cause data corruption or duplicate effects. Use `context` to track already-executed operations.

**Bad:** Charging a credit card on every retry → duplicate charges!

**Good:** Store transaction ID in context and check before re-charging.

### Keep Steps Small and Focused

Each step should do one thing well:
- Send a message
- Make a single API call
- Wait a specific duration
- Enqueue another job for background processing

Avoid long-running synchronous operations inside a step. If an operation takes > 30 seconds, consider:
- Breaking it into smaller steps
- Using a `queue-job` step to delegate to another worker
- Increasing step timeout with `timeoutMs`

### Use Compensation for Cleanup

Define compensation at both workflow and step level:
- **Workflow-level:** Things to undo if the whole process fails (e.g., delete created records, revoke access)
- **Step-level:** Things to undo if just that step fails (e.g., refund a charge, delete a temporary file)

Compensation steps execute in **reverse order** of the original steps (LIFO), ensuring proper cleanup hierarchy.

### Test Failure Scenarios

**Always test:**
1. Step retry behavior (simulate transient failures)
2. Compensation execution (cancel a running workflow)
3. Timeout handling (set low timeouts in test)
4. Network failures (disconnect external service)

Use the `cause` parameter in retry policies to fine-tune behavior:

```typescript
retryPolicy: {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitterFactor: 0.1
}
```

### Monitor Metrics and Alerts

Set up alerts for:
- Workflow failure rate > 5% over 5 min
- Queue depth > 1000 (indicates backlog)
- Average workflow duration > expected baseline
- Compensation triggered > 0 (manual investigation)

### Use Context for Data Sharing

The `context` object is passed between steps and persists across retries:

```json
{
  "context": {
    "customerId": "cust_123",
    "orderId": "ord_456",
    "paymentToken": "tok_xyz"
  }
}
```

Mutate context in step outputs to pass data forward:

```typescript
// Step 1 output becomes part of context for step 2
{
  "output": {
    "transactionId": "txn_789"
  }
}
// Next step can access as {{context.transactionId}}
```

### Limit Workflow Concurrency

To prevent runaway workflows from overloading the system:

1. **Rate limit** workflow starts at the API layer (future feature)
2. **Use priorities** to ensure critical workflows jump the queue
3. **Set reasonable timeouts** to auto-fail hung workflows
4. **Monitor queue depth** and scale workers if needed

## Troubleshooting

### Workflow Stuck in PENDING

**Check:**
1. Is a BullMQ worker running? (`startWorkflowWorker()` must be called on startup)
2. Are there errors in the worker logs? (look for `[WorkflowProcessor]`)
3. Is Redis accessible? (worker needs Redis to fetch jobs)
4. Are there sufficient queue concurrency slots? (Check `QUEUE_CONCURRENCY`)

### Workflow Not Advancing After Step Completion

**Check:**
1. Verify step history shows `COMPLETED` status in database
2. Check `advanceStep()` logic - it should enqueue next step
3. Look for enqueue errors in logs (`[WorkflowEngine]`)
4. Ensure next step exists (currentStep + 1 < steps.length)

### Compensation Never Runs

**Check:**
1. Is compensation defined? (check `compensationJson` in WorkflowDefinition)
2. Is `runCompensation()` called in `failWorkflow()` or `cancelWorkflow()`?
3. Look for `[Compensation]` log entries
4. Check WorkflowInstance status should transition to `COMPENSATING` → `COMPENSATED`

### High Retry Counts

If steps are retrying excessively:
1. Review error classification in `retry-policy.ts`
2. Check if error is truly transient or permanent misclassification
3. Adjust retry policy for that step type (reduce `maxAttempts` or set to 0)
4. Investigate root cause of external service failures

### Memory Leaks

The workflow engine is designed to be stateless between step executions. If memory grows:
1. Ensure no global state accumulation in the worker
2. Clear caches after each step if using external libraries
3. Monitor Node.js heap usage in production

## Performance Considerations

### Queue Priorities

Workflow steps use `MessagePriority.MEDIUM` by default, but individual steps can override with `priority: 'low' | 'normal' | 'high' | 'critical'`. Higher priority jobs preempt lower ones.

### Database Indexes

The following indexes are crucial for performance:

```prisma
@@index([instanceId]) on WorkflowStepHistory
@@unique([instanceId, stepIndex]) on WorkflowStepHistory
@@index([orgId]) on WorkflowInstance  // if adding later
@@index([status, startedAt]) on WorkflowInstance  // for list queries
```

### Connection Pooling

Ensure Prisma connection pool is configured appropriately:
- `DATABASE_POOL_MIN` (default: 2)
- `DATABASE_POOL_MAX` (default: 20)

High concurrency workloads may need `max=50` and appropriate PostgreSQL `max_connections`.

## Future Enhancements

- Parallel step execution (concurrent branches)
- Subworkflows / nested workflows
- Visual workflow designer UI
- Step-level timeout enforcement (automatic failure if step runs too long)
- Conditional branching with JavaScript expression evaluation
- Workflow templates marketplace
- Dry-run mode for testing
- SLA tracking and deadline warnings
- Export/import workflow definitions as YAML

## Testing

### Unit Tests

Run workflow orchestration unit tests:

```bash
cd backend
npm test -- workflow-orchestration.unit.test.ts
```

Test coverage areas:
- Retry policy calculations
- Error classification
- Queue enqueue logic
- Engine state transitions
- Processor action handling
- Compensation execution

### Integration Tests

Run the integration test suite:

```bash
npm test -- workflow-orchestration.integration.test.ts
```

These tests cover:
- Full API lifecycle (CRUD operations)
- Validation schemas
- Workflow start and status retrieval
- Cancellation flow
- Health endpoint

### End-to-End Manual Test

```bash
# 1. Start server
npm run dev

# 2. Create workflow
curl -X POST http://localhost:3000/admin/workflows \
  -H "Content-Type: application/json" \
  -H "x-org-id: org-123" \
  -d '{
    "workflowId": "demo-wf",
    "name": "Demo Workflow",
    "steps": [
      {
        "name": "wait-1s",
        "action": { "type": "delay", "config": { "delayMs": 1000 } }
      },
      {
        "name": "call-api",
        "action": {
          "type": "api-call",
          "config": {
            "url": "https://httpbin.org/post",
            "method": "POST",
            "body": { "test": true }
          }
        }
      }
    ]
  }'

# 3. Start instance
curl -X POST http://localhost:3000/admin/workflows/instances \
  -H "Content-Type: application/json" \
  -H "x-org-id: org-123" \
  -d '{"definitionId": "<definition-id>", "context": {"foo": "bar"}}'

# 4. Check status
curl http://localhost:3000/admin/workflows/instances/<instanceId> \
  -H "x-org-id: org-123"

# 5. Watch WebSocket events (requires socket.io client)
```

## Migration Notes

This feature was implemented in **Phase 3 Step 3** and requires:

1. **Database migration applied:**
   ```bash
   npx prisma db push
   ```

2. **Worker started:**
   Ensure `startWorkflowWorker()` is called during server bootstrap (in `server.ts`).

3. **Routes registered:**
   The workflow routes are mounted under `/admin/workflows` automatically when `registerWorkflowRoutes()` is invoked.

## References

- Source: `backend/src/lib/workflow-orchestration/`
- API Routes: `backend/src/app/api/workflow-orchestration/route.ts`
- Prisma Schema: `backend/prisma/schema.prisma`
- Migration: `backend/prisma/migrations/20260317140000_add_workflow_orchestration/`
- Tests: `backend/src/test/workflow-orchestration*.test.ts`
- OpenAPI Spec: TODO (to be added to `docs/openapi.yaml`)
