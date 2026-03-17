# Phase 3 Step 3: Async Flow Orchestration - Implementation Plan

## Context

This step builds upon the solid foundations of Step 1 (Retry/DLQ) and Step 2 (Status Tracking). The goal is to implement a **multi-step workflow orchestration engine** that enables complex, async business processes with Saga pattern compensation and rollback capabilities.

**Why this is needed:**
- Current system processes individual messages/jobs in isolation
- Business processes often require multiple coordinated steps (e.g., send WhatsApp message → wait for delivery receipt → update CRM → notify user agent)
- Failures in multi-step processes need automatic compensation to maintain data consistency
- Need visibility into workflow execution for debugging and monitoring
- Support for timeouts, parallel steps, and conditional branching

## Existing Patterns to Reuse

### 1. Queue System Pattern (src/lib/message-queue-priority-system/)
- BullMQ queue with priority support
- Job type constants in `types.ts`
- Worker wrapper with processJob() dispatcher
- Metrics instrumentation via prom-client
- Feature flags for zero-downtime rollout

### 2. Status Tracking Pattern (src/lib/message-status-tracking/)
- Centralized state management via status-manager.ts
- Atomic transactions with Prisma
- History/audit trail recording
- WebSocket event emission
- Metrics tracking integrated

### 3. Admin API Pattern (e.g., src/app/api/message-retry-and-dlq/route.ts)
- Zod validation schemas
- Standard response format: `{ success: boolean, data?: any, error?: string }`
- Error handling with try/catch and proper HTTP status codes
- SUPER_ADMIN authorization (via middleware + orgGuard)
- Pagination with limit/offset (or cursor-based)
- Metrics instrumentation

### 4. Metrics Pattern (src/lib/create-comprehensive-metrics-dashboard-(grafana)/index.ts)
- Counter, Histogram, Gauge from prom-client
- Label names for dimensioning
- Consistent naming: `whatsapp_platform_<feature>_<metric>`
- register metrics at module level, initialize in setupMetrics()

## Architectural Design

### Core Concepts

**Workflow Definition:** Static JSON/YAML configuration that describes:
- Unique workflow ID (e.g., "send-marketing-message-sequence")
- Human-readable name and description
- List of steps (ordered)
- Compensation steps (for each step or global)
- Timeout configuration (per-step and overall)
- Retry policy (for entire workflow or per-step)
- Concurrency controls (max parallel executions)

**Workflow Instance:** Runtime execution state:
- Unique instance ID
- Workflow definition ID (foreign key)
- Current status (RUNNING, COMPLETED, FAILED, CANCELLED, COMPENSATING)
- Context data (JSON blob shared across steps)
- Current step index or step ID
- Started at / completed at timestamps
- Failure reason if applicable

**Workflow Step Execution:** Each step runs as a separate BullMQ job of type `WORKFLOW_STEP`:
- Job data includes: workflowInstanceId, step index/name, input data
- Processor executes the step's action (could be message send, API call, custom logic)
- On success: advance to next step (or complete)
- On failure: trigger compensation (if configured) or mark instance failed
- Step status persisted to WorkflowStepHistory table

### Database Schema

Add to `prisma/schema.prisma`:

```prisma
model WorkflowDefinition {
  id                String   @id @default(cuid())
  workflowId        String   @unique // e.g., "send-notification-with-followup"
  name              String
  description       String?
  version           Int      @default(1)
  stepsJson         Json     // Array of step definitions
  compensationJson  Json?    // Optional: compensation step definitions
  timeoutMs         Int?     // Default timeout for entire workflow
  retryPolicyJson   Json?    // Default retry policy
  isActive          Boolean  @default(true)
  createdBy         String   // User ID (SUPER_ADMIN)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("workflow_definitions")
  @@index([workflowId])
  @@index([isActive])
}

model WorkflowInstance {
  id                  String   @id @default(cuid())
  instanceId          String   @unique
  definitionId        String
  definition          WorkflowDefinition @relation(fields: [definitionId], references: [id])
  status              WorkflowStatus
  currentStep         Int?     // 0-based index, null if completed/failed
  contextJson         Json     // Shared execution context
  startedAt           DateTime @default(now())
  completedAt         DateTime?
  failedAt            DateTime?
  failureReason       String?
  lastHeartbeatAt     DateTime?
  orgId               String   // For RLS and tenant isolation

  @@map("workflow_instances")
  @@index([definitionId])
  @@index([status])
  @@index([orgId])
  @@index([startedAt])
  @@unique([instanceId, orgId])
}

model WorkflowStepHistory {
  id                  String   @id @default(cuid())
  instanceId          String
  stepIndex           Int
  stepName            String?
  status              WorkflowStepStatus
  startedAt           DateTime @default(now())
  completedAt         DateTime?
  failedAt            DateTime?
  errorMessage        String?
  retryCount          Int      @default(0)
  inputJson           Json?
  outputJson          Json?
  metadata            Json?

  instance WorkflowInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)

  @@map("workflow_step_history")
  @@index([instanceId])
  @@index([stepIndex])
  @@index([startedAt])
  @@compoundIndex(["instanceId", "stepIndex"])
}

enum WorkflowStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
  COMPENSATING
  COMPENSATED
}

enum WorkflowStepStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  SKIPPED
  COMPENSATED
}
```

### Core Library Structure

`src/lib/workflow-orchestration/` (7 files, all ≤250 lines):

1. **types.ts** - TypeScript interfaces
   - WorkflowDefinition (steps, policies)
   - WorkflowInstance (runtime state)
   - WorkflowStep (step configuration)
   - Enums: WorkflowStatus, WorkflowStepStatus
   - Context data shape

2. **engine.ts** - Main orchestration engine
   - `startWorkflow(definitionId, context, options)` - Create instance, enqueue first step
   - `advanceStep(instanceId, result?)` - Move to next step on success
   - `failWorkflow(instanceId, reason)` - Mark failed, trigger compensation if configured
   - `cancelWorkflow(instanceId)` - Graceful cancellation
   - `compensateWorkflow(instanceId)` - Execute compensation steps in reverse order
   - `getWorkflowStatus(instanceId)` - Query instance state
   - All operations use Prisma transactions with RLS context set

3. **processor.ts** - Job processor for WORKFLOW_STEP jobs
   - `processWorkflowStep(job)` - Main entry point called by worker
   - Load workflow instance & definition
   - Execute step logic (could call external service, send message, etc.)
   - Record step completion in WorkflowStepHistory
   - On success: call engine.advanceStep()
   - On failure: apply retry logic (from retry-policy.ts) or trigger compensation
   - Emit WebSocket events: `workflow:step:completed`, `workflow:step:failed`
   - Record metrics

4. **compensation.ts** - Compensation/rollback logic
   - `executeCompensation(instanceId, failedStepIndex)` - Run compensating actions in reverse order
   - Supports both global compensation (single flow) and per-step compensation
   - Idempotent compensation (safe to retry)
   - Record compensation attempts in history

5. **retry-policy.ts** - Workflow-level retry configuration
   - Define WorkflowRetryPolicy interface (maxAttempts, backoff, etc.)
   - `shouldRetry(attempt, errorType)` - decision logic
   - `calculateDelay(attempt)` - exponential backoff with jitter
   - Load policy from definition or use defaults

6. **queue.ts** - Queue integration
   - Queue name: `workflow-steps` (or reuse main queue with job type WORKFLOW_STEP)
   - `enqueueStep(instanceId, stepIndex, stepName, payload)` - Add step job to queue
   - Job options: priority (from step.priority), TTL (from step.timeout), deduplication ID
   - Set parent relationship: job.opts.parent = previous job ID (for BullMQ job dependency)
   - Exports queue and scheduler

7. **index.ts** - Barrel export
   - Re-export public API: startWorkflow, getWorkflowStatus, cancelWorkflow, getMetrics
   - Initialize function: `initializeWorkflowSystem()` to start worker
   - Feature flag: `ENABLE_WORKFLOW_ORCHESTRATION` (default false)

### Admin API Structure

`src/app/api/workflow-orchestration/` (3 files):

1. **route.ts** - All admin endpoints under `/admin/workflows`
   - `POST /admin/workflows` - Create/register workflow definition (SUPER_ADMIN)
   - `GET /admin/workflows` - List definitions (with pagination, filters)
   - `GET /admin/workflows/:id` - Get definition details
   - `PUT /admin/workflows/:id` - Update definition (versioning)
   - `DELETE /admin/workflows/:id` - Soft delete (set isActive=false)
   - `POST /admin/workflows/instances` - Start new workflow instance (from API or manual trigger)
   - `GET /admin/workflows/instances` - List instances (filters: definitionId, status, orgId)
   - `GET /admin/workflows/instances/:instanceId` - Get instance details with step history
   - `POST /admin/workflows/instances/:instanceId/cancel` - Cancel running instance
   - `POST /admin/workflows/instances/:instanceId/compensate` - Manually trigger compensation
   - `GET /admin/workflows/instances/:instanceId/health` - Check if instance is stuck/timeout

2. **validation.ts** (or inline schemas) - Zod schemas
   - `workflowDefinitionSchema` - Validate definition structure
   - `workflowInstanceQuerySchema` - List/query parameters
   - `workflowActionSchema` - Cancel/compensate request bodies

3. **metrics.ts** - Workflow-specific metrics (if needed separate from processor)

**Response format:** Standardized like other admin APIs:
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

### Metrics to Add

In `src/lib/create-comprehensive-metrics-dashboard-(grafana)/index.ts`:

```typescript
// Workflow Orchestration Metrics
export const workflowInstancesTotal = new Counter({
  name: 'whatsapp_platform_workflow_instances_total',
  help: 'Total number of workflow instances created',
  labelNames: ['workflow_id', 'org_id', 'status'],
});

export const workflowStepsCompletedTotal = new Counter({
  name: 'whatsapp_platform_workflow_steps_completed_total',
  help: 'Total number of workflow steps completed successfully',
  labelNames: ['workflow_id', 'step_name'],
});

export const workflowStepsFailedTotal = new Counter({
  name: 'whatsapp_platform_workflow_steps_failed_total',
  help: 'Total number of workflow steps that failed',
  labelNames: ['workflow_id', 'step_name', 'error_category'],
});

export const workflowCompensationsTriggeredTotal = new Counter({
  name: 'whatsapp_platform_workflow_compensations_triggered_total',
  help: 'Total number of compensation flows triggered',
  labelNames: ['workflow_id', 'trigger_reason'],
});

export const workflowDurationSeconds = new Histogram({
  name: 'whatsapp_platform_workflow_duration_seconds',
  help: 'Workflow execution duration from start to completion',
  labelNames: ['workflow_id', 'status'],
  buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
});

export const workflowStepDurationSeconds = new Histogram({
  name: 'whatsapp_platform_workflow_step_duration_seconds',
  help: 'Individual step execution duration',
  labelNames: ['workflow_id', 'step_name'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
});
```

### WebSocket Events

Leverage existing Socket.IO service (`src/lib/build-real-time-messaging-with-socket.io/`):

- `workflow:instance:started` - Emitted when workflow instance created
- `workflow:instance:completed` - Workflow finished successfully
- `workflow:instance:failed` - Workflow failed (may include compensation)
- `workflow:instance:cancelled` - Manual cancellation
- `workflow:step:started` - Step execution began
- `workflow:step:completed` - Step succeeded
- `workflow:step:failed` - Step failed (with error info)
- `workflow:compensation:started` - Compensation flow initiated
- `workflow:compensation:completed` - All compensations done

Emit to:
- Org room: `org-{orgId}` (for org-level visibility)
- No instance room needed (workflows are org-level entities)

### Integration Points with Existing Systems

1. **Queue System** - Add `WORKFLOW_STEP` to MessageType enum in `src/lib/message-queue-priority-system/types.ts`
2. **Worker** - Modify `consumer.ts` to add `processWorkflowStep` to the dispatcher
3. **Server** - Register workflow admin routes in `src/server.ts` after other admin APIs
4. **Retry/DLQ** - Reuse existing retry classification and DLQ logic for workflow steps if they fail
5. **Status Tracking** - Could create WorkflowStepStatusHistory table (similar to MessageStatusHistory) but may reuse existing workflow_step_history
6. **Socket** - Inject socket service into workflow engine for event emission (similar to status manager)

## Implementation Phases (Within Step 3)

### Phase A: Database & Types (Day 1)
1. Extend Prisma schema with WorkflowDefinition, WorkflowInstance, WorkflowStepHistory models
2. Run `npx prisma migrate dev --name add-workflow-orchestration`
3. Create `src/lib/workflow-orchestration/types.ts` with TypeScript interfaces

### Phase B: Core Engine (Day 1-2)
4. Implement `engine.ts` - create instance, advance step, fail/cancel compensation
5. Implement `compensation.ts` - compensation execution logic
6. Implement `retry-policy.ts` - workflow retry configuration
7. Create `queue.ts` - enqueue step jobs with proper options

### Phase C: Worker Integration (Day 2)
8. Create `processor.ts` - job processor for WORKFLOW_STEP
9. Update `consumer.ts` - register processWorkflowStep dispatcher
10. Add WORKFLOW_STEP to MessageType enum
11. Create `index.ts` - public API and initialization

### Phase D: Admin API (Day 2-3)
12. Create `src/app/api/workflow-orchestration/route.ts` with all endpoints
13. Implement handlers with Zod validation
14. Register routes in `src/server.ts`

### Phase E: Metrics & WebSocket (Day 3)
15. Add 7 workflow metrics to `metrics-dashboard/index.ts`
16. Wire WebSocket events in processor and engine
17. Update `setupMetrics()` if needed

### Phase F: Testing & Documentation (Day 3)
18. Unit tests: engine, compensation, retry-policy, queue (30+ tests)
19. Integration tests: API endpoints, workflow execution end-to-end (20+ tests)
20. Create phase3-step3-complete.md report with architecture diagram, metrics, lessons learned

## Detailed File List

### New Files (15)

#### Library (7)
1. `backend/src/lib/workflow-orchestration/types.ts` (150 lines)
2. `backend/src/lib/workflow-orchestration/engine.ts` (230 lines)
3. `backend/src/lib/workflow-orchestration/compensation.ts` (180 lines)
4. `backend/src/lib/workflow-orchestration/retry-policy.ts` (100 lines)
5. `backend/src/lib/workflow-orchestration/processor.ts` (200 lines)
6. `backend/src/lib/workflow-orchestration/queue.ts` (120 lines)
7. `backend/src/lib/workflow-orchestration/index.ts` (80 lines)

#### Admin API (3)
8. `backend/src/app/api/workflow-orchestration/route.ts` (300 lines)
9. `backend/src/app/api/workflow-orchestration/validation.ts` (100 lines) OR inline
10. (optional) `backend/src/app/api/workflow-orchestration/metrics.ts`

#### Tests (4+)
11. `backend/src/test/workflow-orchestration.unit.test.ts` (350 lines) - 30+ tests
12. `backend/src/test/workflow-orchestration.integration.test.ts` (400 lines) - 20+ scenarios
13. `backend/src/test/workflow-orchestration.fixtures.ts` - Test data helpers (optional)
14. (optional) Additional test files for complex scenarios

#### Documentation (1)
15. `backend/reports/phase3-step3-report.md` - Completion report

### Modified Files (3)

1. **`backend/prisma/schema.prisma`** - Add 3 new models (WorkflowDefinition, WorkflowInstance, WorkflowStepHistory) + enums
2. **`backend/src/lib/message-queue-priority-system/types.ts`** - Add `WORKFLOW_STEP` to MessageType enum
3. **`backend/src/lib/message-queue-priority-system/consumer.ts`** - Add `isWorkflowStep()` guard and `processWorkflowStep()` case
4. **`backend/src/server.ts`** - Register workflow routes:
   ```typescript
   const workflowRoutes = await import('./app/api/workflow-orchestration/route.js');
   await app.register(workflowRoutes.default || workflowRoutes, { prefix: '/admin/workflows' });
   ```
5. **`backend/src/lib/create-comprehensive-metrics-dashboard-(grafana)/index.ts`** - Add 7 workflow metrics and export them

**Note:** The modified files count may be 5 depending on how we structure validation (separate file vs inline).

### Environment Variables (New)

Add to `.env.example`:
```
ENABLE_WORKFLOW_ORCHESTRATION=false
WORKFLOW_MAX_RETRIES=3
WORKFLOW_BASE_RETRY_DELAY_MS=1000
WORKFLOW_TIMEOUT_DEFAULT_MS=3600000  # 1 hour
```

## Testing Strategy

### Unit Tests (30+)
- Engine: startWorkflow, advanceStep, failWorkflow, cancelWorkflow, compensateWorkflow
- Compensation: execute in reverse order, idempotency, partial failure handling
- Retry policy: shouldRetry decisions, delay calculation with jitter
- Queue: enqueueStep sets correct job options (priority, TTL, parent)
- Types: validation of definition structure

### Integration Tests (20+)
- End-to-end workflow execution: create definition → start instance → steps execute → complete
- Failure scenario: step fails → retry → eventually DLQ or compensation
- Compensation: step 2 fails → compensate step 1 → mark workflow compensated
- Timeout: step exceeds timeout → workflow fails
- API: All endpoints with auth, RLS, validation
- WebSocket: Events emitted correctly
- Metrics: Counters increment, histograms observe

### Test Fixtures
- Sample workflow definition: 3-step sequence with simple actions (log, update DB, send notification)
- Mock step processors that simulate success/failure/timeout
- Test database with seeded data

## Verification Checklist

- [ ] Prisma migration applied successfully (`npx prisma migrate dev`)
- [ ] All unit tests pass (`npm test -- --testPathPattern=workflow`)
- [ ] All integration tests pass
- [ ] TypeScript build succeeds (`npm run build`)
- [ ] Server starts without errors on port 9403
- [ ] Workflow admin API endpoints respond correctly (test with curl/Postman)
- [ ] Metrics endpoint `/metrics` includes workflow_platform_* metrics
- [ ] WebSocket events received by client (manual test with simple HTML page)
- [ ] Database indexes created for performance
- [ ] RLS policies added for new tables (if needed - workflow instances are org-scoped)
- [ ] Feature flag `ENABLE_WORKFLOW_ORCHESTRATION` defaults to false

## Performance Considerations

- **Workflow Instance Storage:** JSONB context can grow; consider size limits (max 1MB?)
- **Step History Volume:** Each step creates a row; implement cleanup policy (e.g., delete after 90 days for COMPLETED workflows)
- **Queue Load:** Each workflow with N steps creates N jobs; ensure concurrency limits respected
- **Database Queries:** Index on WorkflowInstance(orgId, status, startedAt) for admin queries
- **Compensation:** Should run async (enqueue compensation steps, not block)

## Risk Mitigation

- **Feature Flag:** Default disabled; enable only after testing
- **Backoff:** Use exponential backoff with jitter to prevent thundering herd
- **Idempotency:** Step processors must be idempotent (safe to retry)
- **Timeouts:** Enforce step-level and workflow-level timeouts to prevent stuck executions
- **Monitoring:** Grafana dashboard for workflow success rate, duration, step failures
- **DLQ Integration:** Failed workflow steps can go to existing DLQ system

## Success Criteria

- ✅ Can define a multi-step workflow (stored in DB)
- ✅ Can start workflow instance via API
- ✅ Steps execute asynchronously via BullMQ
- ✅ On step success, workflow advances to next step
- ✅ On step failure, retry logic applies or compensation triggers
- ✅ Compensation steps execute in reverse order
- ✅ Admin API provides visibility: list definitions, list instances, view step history
- ✅ WebSocket events broadcast real-time updates
- ✅ Metrics track: instances created, steps completed/failed, compensations, duration
- ✅ All tests pass (50+ total)
- ✅ Code follows architectural rules: ≤250 lines/file, TypeScript strict, Zod validation, RLS enforcement

## Estimated Effort

- **Design & Planning:** 2 hours (this document)
- **Database & Types:** 2 hours
- **Core Engine + Compensation:** 6 hours
- **Worker Integration:** 3 hours
- **Admin API:** 4 hours
- **Metrics + WebSocket:** 2 hours
- **Testing:** 4 hours
- **Documentation & Refinement:** 2 hours
- **Buffer (unexpected issues):** 5 hours

**Total: ~30 hours (3-4 days)**

## Next Steps After Completion

This enables Phase 4 (AI & Advanced Analytics) features:
- AI-powered workflow suggestions
- A/B testing with workflow variants
- Real-time analytics streaming
- Predictive timeout detection
