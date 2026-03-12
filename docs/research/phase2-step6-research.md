# Phase 2 Step 6 Research: Message Deduplication System

**Date:** March 11, 2026
**Objective:** Implement message deduplication to prevent duplicate WhatsApp messages from being sent, controlling costs and improving user experience
**Architecture Context:** Multi-tenant WhatsApp platform using BullMQ, Redis, PostgreSQL with RLS, Evolution API webhooks

---

## 1. Executive Summary

**Problem:** WhatsApp charges per message. Sending duplicates wastes money and confuses customers. Common causes:
- Network timeouts causing client retries
- Webhook redelivery (Evolution/WhatsApp may resend events)
- Application bugs causing duplicate enqueues
- Race conditions in distributed systems

**Solution:** Implement a deduplication system at the queue level using BullMQ's built-in deduplication feature. This provides:
- Automatic deduplication with configurable TTL
- Three modes: Simple, Throttle, Debounce
- Zero external dependencies (uses Redis locks built into BullMQ)
- Transparent integration with existing message queue

**Recommended Approach:** Use BullMQ's native deduplication with **throttle mode** for message upserts (1-hour TTL, extendable) and disable for idempotent operations (status updates, deletes).

**Alternatives Considered:**
- Custom Redis-based deduplication: More flexible but adds complexity and maintenance burden
- Application-level deduplication: Fragile, requires coordination across services
- No deduplication: Costs and UX issues unacceptable

---

## 2. BullMQ Deduplication Deep Dive

### 2.1 How It Works

BullMQ implements deduplication using Redis locks:

1. When adding a job with `deduplication: { id, ttl }`, BullMQ creates a Redis key: `bull:deduplication:{queueName}:{jobId}`
2. If key exists (within TTL), the job is rejected as duplicate
3. For **extend** mode: each duplicate attempt refreshes the TTL
4. For **replace** mode (requires delay): pending job data is replaced with latest

**Important:** Deduplication only works while job is in the queue (waiting, delayed, active). Once completed/failed, the lock expires and a new job with same ID can be added.

### 2.2 Deduplication Modes

#### Simple Mode
```typescript
await queue.add('process', data, {
  deduplication: { id: 'unique-id' }
});
// Blocks duplicates indefinitely (until job completes/fails)
```

**Use case:** Critical operations that must never duplicate (financial transactions)

#### Throttle Mode
```typescript
await queue.add('process', data, {
  deduplication: { id: 'unique-id', ttl: 5_000 } // 5 seconds
});
// Blocks duplicates for 5 seconds, regardless of job state
```

**Use case:** Rate limiting duplicate events (our choice for message upserts)

#### Debounce Mode
```typescript
await queue.add('process', data, {
  deduplication: { id: 'unique-id', ttl: 5_000, extend: true, replace: true },
  delay: 5_000 // Required for replace to work
});
// Replaces pending job with latest data, extends TTL
```

**Use case:** Rapid successive updates where only latest matters (search indexing, UI updates)

---

## 3. Designing the Deduplication System

### 3.1 Deduplication Key Generation

**Strategy:** Generate deterministic ID from payload content.

For `MESSAGE_UPSERT`:
```typescript
{
  type: 'message_upsert',
  orgId: string,
  instanceId: string,
  whatsappMessageId: string | undefined, // Prefer WhatsApp's unique ID if available
  content: string, // For custom messages without WhatsApp ID
  to: string,
  from: string
}
```

**Key properties:**
- Use WhatsApp's `messageId` from webhook when available (guaranteed unique by WhatsApp)
- For custom-origin messages, hash content + recipients + org/instance
- Include tenant scope (orgId) to prevent cross-tenant false positives

**Implementation:** SHA-256 hash of sorted JSON keys, truncated to 32 chars.

### 3.2 Configuration Strategy

Different message types need different deduplication approaches:

| Message Type | Deduplication | Strategy | TTL | Rationale |
|--------------|---------------|----------|-----|-----------|
| MESSAGE_UPSERT | **Enabled** | Throttle | 1 hour (extendable) | Prevents duplicate message sends |
| MESSAGE_STATUS_UPDATE | Disabled | - | - | Idempotent by design (same status can be received multiple times) |
| MESSAGE_DELETE | Disabled | - | - | Idempotent - deleting already-deleted is safe |
| INSTANCE_STATUS_UPDATE | Disabled | - | - | Frequent status changes, no harm in duplicates |
| CONTACT_UPDATE | Enabled | Throttle | 30 min | Contact sync can be repeated safely |
| ANALYTICS_EVENT | Disabled | - | - | Should record all events |
| WEBHOOK_EVENT | Disabled | - | - | Webhooks should all be processed |
| DATABASE_CLEANUP | Disabled | - | - | Scheduled task, don't deduplicate |
| CACHE_REFRESH | Disabled | - | - | Always execute to ensure freshness |

**Default:** Conservative approach. Enable only where duplicate harm is clear.

### 3.3 Metrics & Monitoring

Track deduplication effectiveness:
```typescript
interface DeduplicationMetrics {
  totalJobs: number;
  deduplicatedJobs: number;
  uniqueJobsAdded: number;
  byMessageType: Record<MessageType, { total: number; deduplicated: number }>;
}
```

**Alerting:** Set up monitoring on:
- High deduplication rate (>80%) → May indicate client retry storms or bugs
- Sudden drop to 0% when expected >0 → May indicate deduplication disabled

---

## 4. Integration with Existing System

### 4.1 Modifications to Message Queue

Add deduplication support to `addJob()` in `src/lib/message-queue-priority-system/index.ts`:

```typescript
export async function addJob(
  type: MessageType,
  payload: Record<string, unknown>,
  options: {
    priority?: MessagePriority;
    deduplication?: {
      id?: string;
      ttl?: number;
      enabled?: boolean;
      extend?: boolean;
      replace?: boolean;
      delay?: number;
    };
  } = {}
): Promise<any> {
  const priority = options.priority ?? getPriorityForType(type);
  const bullmqOptions: any = { priority };

  if (options.deduplication) {
    const dedupId = options.deduplication.id ??
      generateDeduplicationId(type, payload); // From deduplication lib
    bullmqOptions.deduplication = {
      id: dedupId,
      ttl: options.deduplication.ttl ?? 60 * 60 * 1000
    };
    if (options.deduplication.extend) bullmqOptions.extend = true;
    if (options.deduplication.replace) bullmqOptions.replace = true;
    if (options.deduplication.delay) bullmqOptions.delay = options.deduplication.delay;
  }

  return await messageQueue.add(type, jobData, bullmqOptions);
}
```

### 4.2 Producer Updates

Update `queueMessageUpsert()` to enable deduplication:

```typescript
export async function queueMessageUpsert(data: {...}): Promise<any> {
  return await addJob(MessageType.MESSAGE_UPSERT, { ...data }, {
    deduplication: {
      enabled: true,
      ttl: 60 * 60 * 1000,
      extend: true
    }
  });
}
```

### 4.3 No Consumer Changes

Deduplication happens **at enqueue time**. The consumer (`processMessageUpsert`) remains unchanged. BullMQ ensures duplicates never reach the worker.

---

## 5. API Endpoints

Expose endpoints for monitoring and configuration:

### GET `/api/deduplication/config`
Returns current deduplication configuration for all message types.

### POST `/api/deduplication/config`
Update configuration for a specific message type (runtime, no restart needed).

### GET `/api/deduplication/metrics`
Returns deduplication metrics (counts, breakdown by type).

### POST `/api/deduplication/metrics/reset`
Reset metrics counters.

### POST `/api/deduplication/check`
Check what the deduplication ID would be for a given payload (testing/validation).

### GET `/api/deduplication/health`
Health check endpoint.

---

## 6. Testing Strategy

### 6.1 Unit Tests (in `src/test/message-deduplication-system.test.ts`)

- `generateDeduplicationId()`: Consistent hashing, tenant isolation, webhook vs custom payloads
- `getDeduplicationConfig()`: Default values, custom overrides
- `buildDeduplicationOptions()`: Correct BullMQ option shapes for all strategies
- `recordDeduplicationAttempt()` / `getDeduplicationMetrics()`: Metrics accumulation, reset
- `checkPotentialDuplicate()`: Returns correct reason codes

**Goal:** 100% coverage of pure logic functions (no Redis needed).

### 6.2 Integration Tests (in `src/test/deduplication-api.integration.test.ts`)

- All API endpoints return correct status codes and shapes
- Configuration updates persist in memory
- Metrics reflect API calls
- Health check returns 200

**Note:** Full BullMQ integration requires Redis and is out of scope for unit tests. Existing test suite mocks the queue anyway.

---

## 7. Implementation Plan

### Step 6.1: Core Library (`src/lib/implement-message-deduplication-system/`)

- `types.ts`: Type definitions (DeduplicationConfig, DeduplicationStrategy enum, metrics)
- `index.ts`: Main implementation (ID generation, config getters, metrics tracking)
- **Lines:** ~250
- **Tests:** Unit tests in `src/test/message-deduplication-system.test.ts`

### Step 6.2: API Routes (`src/app/api/implement-message-deduplication-system/`)

- `route.ts`: All endpoints listed above
- **Lines:** ~150
- **Integration:** Register in `backend/src/server.ts`
- **Tests:** Integration tests in `src/test/deduplication-api.integration.test.ts`

### Step 6.3: Producer Integration

- Update `backend/src/lib/message-queue-priority-system/producer.ts`: Add deduplication options to `queueMessageUpsert()`
- Optionally update `addJob()` to accept deduplication options (already done)

### Step 6.4: Validation & Finalization

- Run all tests (unit + integration)
- Check TypeScript compilation (zero errors)
- Verify no console errors/warnings
- Ensure ESLint passes
- Generate report: `reports/phase2-step6-report.md`

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False positives (legitimate messages marked duplicate) | Medium | High | Careful key design: include messageId if available, hash content, isolate by org/instance |
| Performance overhead from hashing | Low | Low | Hashing is fast (<1ms); only on enqueue (not critical path) |
| Lock expiration too short → duplicates | Medium | Medium | Set conservative TTL (1 hour); can be tuned via API |
| Lock expiration too long → stale locks | Low | Medium | Use `extend: true` to refresh on duplicates; provide manual config override |
| Memory leak from metrics tracking | Low | Low | Metrics in-memory only, bounded by message type count (9 types) |
| Race condition in metrics update | Low | Low | Metrics not critical; slight inaccuracies acceptable |

---

## 9. References

- [BullMQ Deduplication Documentation](https://docs.bullmq.io/guide/jobs/deduplication)
- [BullMQ Job Options Reference](https://docs.bullmq.io/guide/jobs/job-options)
- [System Design: Message Deduplication (Medium)](https://medium.com/@aditimishra_541/system-design-message-deduplication-system-afb4679c3c00)
- [Redis Lock Patterns](https://redis.io/docs/latest/develop/use/patterns/distributed-locks/)
- [Exactly-Once Semantics in Distributed Queues](https://www.enterpriseintegrationpatterns.com/patterns/messaging/ExactlyOnceDelivery.html)

---

## 10. Questions Answered from Phase Plan

**What are the security considerations for deduplication?**
- Deduplication uses Redis keys namespaced by queue name - no cross-queue interference
- Key TTL automatically enforced by BullMQ - no manual cleanup
- No data exposure - hash is deterministic but not reversible
- Tenant isolation via orgId in key generation prevents cross-tenant attacks

**How to test deduplication effectively?**
- Unit tests for deterministic ID generation (compare hashes)
- Integration tests for API endpoints (mocked Redis)
- End-to-end test: enqueue duplicate message, verify second is rejected
- Metrics validation: confirm counters increment correctly

**What are common pitfalls?**
- Using non-deterministic IDs (e.g., `uuidv4()`) → deduplication fails
- Forgetting to include tenant scope → cross-tenant false positives
- TTL too short → duplicates slip through
- TTL too long with no extend → stale lock blocks legitimate message after TTL expiry
- Enabling on idempotent operations → unnecessary overhead

---

## 11. Decision Log

**Decision:** Use BullMQ native deduplication vs custom Redis implementation
**Rationale:** Less code, battle-tested, no new dependencies, leverages existing Redis infrastructure. BullMQ's deduplication is specifically designed for job queues and handles edge cases (race conditions, TTL expiry) correctly.

**Decision:** Throttle mode with 1-hour TTL for MESSAGE_UPSERT
**Rationale:** WhatsApp messages are high-value (cost $0.005-0.07 each). 1-hour window covers typical retry storms (network blips) without being too restrictive. Extendable on duplicates means frequent retries keep extending lock, preventing spam.

**Decision:** Disable for MESSAGE_STATUS_UPDATE and MESSAGE_DELETE
**Rationale:** These operations are inherently idempotent - receiving same event multiple times is harmless. No need to waste deduplication resources.

**Decision:** Store metrics in-memory (not Redis/DB)
**Rationale:** Metrics are ephemeral, reset on restart acceptable. Avoids additional Redis calls on hot path (enqueue). Can monitor via Prometheus node_exporter if needed.

**Decision:** Allow runtime configuration via API
**Rationale:** TTL/strategy may need tuning after observing production traffic. API allows changes without restart. Not persisted across restarts (acceptable for now, can add DB later if needed).

---

## Summary

This research provides a comprehensive solution for message deduplication using BullMQ's built-in feature. Implementation will be:
- **Low risk:** Leverages well-tested BullMQ code
- **Low maintenance:** No custom Redis logic to maintain
- **Cost-effective:** Prevents duplicate WhatsApp charges
- **Flexible:** Tunable per-message-type via API

Recommended TTLs and strategies are documented, with clear disable/enable defaults based on operation semantics.
