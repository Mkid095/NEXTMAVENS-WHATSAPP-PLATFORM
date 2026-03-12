# Phase 2 Step 3 Research: Message Queue Priority System

## Executive Summary

For implementing a priority-based message queue in our WhatsApp platform, **BullMQ** is the recommended choice. It provides:
- Native priority support (1-255, where lower = higher priority)
- Robust job lifecycle management
- Built-in retry, delay, and rate limiting
- Redis-backed persistence
- TypeScript support
- Active maintenance (successor to Bull)

**Alternative libraries considered:**
- `bee-queue`: Simpler but lacks advanced features
- `kue`: Older, less maintained
- Custom Redis implementation: More work, higher bug risk

---

## Architecture Context

Our Evolution API integration sends webhooks for message status updates. Some messages need priority processing:
- **High Priority (1-3)**: Utility messages (2FA, OTP), security alerts, instance status changes
- **Medium Priority (10-30)**: Regular user messages, contact updates
- **Low Priority (100+)**: Marketing broadcasts, analytics events, cleanup tasks

The queue system will:
1. Receive webhook events from Evolution API
2. Assign priority based on message type
3. Process in priority order (high → medium → low)
4. Handle failures with exponential backoff
5. Provide metrics and monitoring

---

## BullMQ Deep Dive

### Queue Creation

```typescript
import { Queue, QueueScheduler, Worker } from 'bullmq';

// Create queue with Redis connection
const queue = new Queue('messages', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

// Required for delayed jobs and retries
const scheduler = new QueueScheduler('messages', {
  connection: { host: 'localhost', port: 6379 }
});
```

### Priority Implementation

```typescript
// High priority job (processed first)
await queue.add('message-status-update', {
  messageId: '123',
  status: 'delivered',
  instanceId: 'abc'
}, {
  priority: 1  // 1 = highest, 255 = lowest
});

// Normal priority
await queue.add('message-status-update', payload, { priority: 10 });

// Low priority
await queue.add('analytics-event', payload, { priority: 100 });
```

### Worker Processing

```typescript
const worker = new Worker('messages', async job => {
  console.log(`Processing ${job.name} with priority ${job.opts.priority}`);
  // Process the job
  await processMessage(job.data);
}, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 10  // Process 10 jobs concurrently
});

worker.on('completed', job => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job failed: ${err.message}`));
```

---

## Best Practices from Research

### 1. Priority Design
- **Use small priority ranges**: High (1-3), Medium (10-30), Low (100+)
- **Leave gaps** between ranges for future insertion of new priority levels
- **Document priority mapping** in code comments and README

### 2. Error Handling
- Implement **exponential backoff** with jitter to avoid thundering herd
- Set **max attempts** (3-5) before moving to dead letter queue
- Log all failures with context for debugging

### 3. Monitoring
- Use **Bull Board** for visual queue monitoring (optional)
- Expose metrics: queue depth, processing rate, failure rate
- Set up alerts for queue backlog > threshold

### 4. Performance
- **Connection pooling**: Reuse Redis connections across queue instances
- **Concurrency tuning**: Start with 5-10 workers per CPU core
- **Job data size**: Keep payloads small (< 10KB); use references for large data

### 5. Testing Strategy
- Use **mock-redis** or **@socketio/redis-adapter-mock** for unit tests
- **Integration tests** with real Redis instance (Docker)
- **Load tests** to determine optimal concurrency

### 6. Security
- **Redis auth**: Use strong password in production
- **Network isolation**: Redis should not be publicly accessible
- **Input validation**: Zod schemas for all job data
- **Least privilege**: Redis user with only required commands

---

## Integration Points with Existing Code

### Current Architecture
```
Evolution API → Webhook → Backend (DB write) → Socket.io → Frontend
```

### With Priority Queue (New)
```
Evolution API → Webhook → Priority Queue (high/medium/low) → Worker Processor → DB + Socket.io
```

The queue will be **inserted after webhook receipt** but **before DB write**. This ensures:
- Critical messages bypass backlog of low-priority ones
- Ordering guarantees per priority level
- Retry logic is centralized

### File Structure (Proposed)

```
backend/src/lib/message-queue-priority-system/
├── index.ts              # Queue initialization, priority constants
├── producer.ts           # Functions to add jobs to queue
├── consumer.ts           # Worker setup, job processing logic
├── types.ts              # TypeScript interfaces
└── metrics.ts            # Queue metrics, health checks

backend/src/app/api/message-queue/
├── status.route.ts       # GET /api/message-queue/status (queue depth)
└── metrics.route.ts      # GET /api/message-queue/metrics (Prometheus format)
```

---

## Implementation Plan (3 Steps)

### Step 1: Core Queue System
- Create `src/lib/message-queue-priority-system/index.ts`
- Define priority constants: `PRIORITY_HIGH = 1`, `PRIORITY_MEDIUM = 10`, `PRIORITY_LOW = 100`
- Initialize Queue and QueueScheduler with Redis connection from env vars
- Export helper functions: `addHighPriorityJob()`, `addMediumPriorityJob()`, `addLowPriorityJob()`

### Step 2: Producer Integration
- Modify webhook handler (`handlers.ts`) to queue jobs instead of direct DB write
- Implement `src/lib/message-queue-priority-system/producer.ts` with functions:
  - `queueMessageStatusUpdate(data, priority)`
  - `queueAnalyticsEvent(data)`
- Update `src/app/api/integrate-evolution-api-message-status-webhooks/route.ts` to use producer

### Step 3: Worker & Consumer
- Implement `src/lib/message-queue-priority-system/consumer.ts`
- Create Worker with concurrency = 10
- Job processing logic:
  1. Parse job data
  2. Validate with Zod schema
  3. DB write (reuse existing DB logic from handlers)
  4. Socket.io broadcast (reuse existing socket service)
  5. Mark job completed or failed
- Implement error handling with retry/backoff

---

## Validation & Testing Strategy

### Unit Tests (Jest)
- Test priority assignment functions
- Test queue initialization (Redis connection)
- Test job data validation (Zod schemas)
- Mock BullMQ with `jest-mock` or `sinon`

### Integration Tests
- Real Redis instance (Docker container)
- End-to-end: add job → worker processes → DB updated → socket broadcast
- Test priority ordering: add 3 jobs (high, medium, low) → verify high processed first
- Test failure scenarios: invalid data, DB errors, Redis down
- Test concurrency: 100 jobs processed with 10 workers

### Performance Tests
- Measure throughput: jobs/second
- Measure latency: time from enqueue to completion
- Test backlog: 1000 low-priority + 10 high-priority → high priority should not wait

### Manual Testing
- Use Redis CLI: `redis-cli` to inspect queue (`bull:queue:messages`)
- Use Bull Board UI (optional) to monitor jobs
- Send test webhooks with different message types and verify priority processing

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Queue becomes bottleneck | High | Tune concurrency, monitor Redis memory |
| Priority inversion | Medium | Unit tests verify priority ordering |
| Job data loss | High | Persistent Redis, DB write before job completion |
| Memory leaks in workers | Medium | Implement worker shutdown gracefully |
| Redis downtime | Critical | Use Redis Sentinel/Cluster for HA |

---

## Metrics to Track

- **Queue depth**: Number of jobs waiting (by priority)
- **Processing rate**: Jobs/second
- **Average latency**: Time from enqueue to completion (p50, p95, p99)
- **Failure rate**: Percentage of failed jobs
- **Retry rate**: Jobs requiring retry
- **Worker utilization**: Active vs idle workers

---

## Questions for Clarification

1. Should the queue apply to **all webhook events** or only message status updates?
2. What are the **exact priority mappings** for each message type? (Need to enumerate all Evolution API webhook event types)
3. Should we implement **dead letter queue (DLQ)** for permanent failures?
4. Should analytics/batch operations be **separate queue** or same queue with lower priority?
5. What is the **SLA** for high-priority messages? (e.g., < 100ms processing)

---

## Recommended Next Steps

1. **Confirm architecture** with team: insert queue before DB write or after?
2. **Choose library**: BullMQ (recommended) or alternative
3. **Set up Redis** in dev environment (Docker compose)
4. **Implement basic queue** (Step 1) following the plan above
5. **Write tests** in parallel with implementation (TDD)
6. **Benchmark** with realistic payloads to tune concurrency

---

## References

- BullMQ Documentation: https://docs.bullmq.io/
- BullMQ GitHub: https://github.com/taskforcesh/bullmq
- Redis Queue Best Practices: https://redis.io/glossary/redis-queue/
- Node.js Job Queue Comparison: https://www.smashingmagazine.com/2021/05/guide-job-queue-libraries-node-js/
- Priority Queues in Redis: https://redis.io/docs/data-types/sorted-sets/

---

**Research Completed:** March 11, 2026
**Next Action:** Create branch `phase2-step-3-implement-message-queue-priority-system` and begin implementation
