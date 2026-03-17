# Phase 3 Step 2 - IN PROGRESS: Message Status Tracking

## Objective
Implement comprehensive message status tracking with full history, audit trail, real-time WebSocket notifications, and status metrics distribution.

## Status: 🚧 IN PROGRESS

About 60% complete. Core database, API, and manager logic done. WebSocket integration and full metrics pending.

---

## What's Completed So Far

### ✅ Database Schema (Prisma)

**File**: `backend/prisma/schema.prisma`

Added `MessageStatusHistory` model:
```prisma
model MessageStatusHistory {
  id          String   @id @default(cuid())
  messageId   String
  status      MessageStatus
  changedAt   DateTime @default(now())
  changedBy   String?   // "system" or user ID
  reason      String?   // "webhook", "admin", "queue", "dlq", "creation"
  metadata    Json?     // Error details, retry count, etc.

  message WhatsAppMessage @relation(fields: [messageId], references: [id])

  @@map("message_status_history")
  @@index([messageId])
  @@index([changedAt])
  @@index([messageId, changedAt])
}
```

Also added new enum value:
```prisma
enum MessageStatus {
  PENDING
  SENDING
  SENT
  DELIVERED
  READ
  FAILED
  REJECTED
  CANCELLED  // NEW
}
```

### ✅ Type Definitions

**File**: `backend/src/lib/message-status-tracking/types.ts` (226 lines)

- `StatusChangeReason` enum: `WEBHOOK`, `ADMIN`, `QUEUE`, `DLQ`, `CREATION`, `RECEIPT`, `SYSTEM`
- `StatusHistoryEntry` interface (full entry with relations)
- `StatusHistoryFilter` for querying
- `StatusMetrics` interfaces: `StatusDistribution`, `StatusTransitionMetrics`, `ReasonMetrics`
- Validation helpers: `isValidStatusTransition()`, ` getAllowedTransitions()`
- Utility functions: `formatTransitionKey()`, `computeTransitions()`

### ✅ Status Manager (Core Logic)

**File**: `backend/src/lib/message-status-tracking/status-manager.ts` (442 lines)

Main functions:
- `updateMessageStatus(messageId, orgId, { status, changedBy, reason, metadata })`
  - Updates `WhatsAppMessage.status`
  - Records history entry
  - Emits WebSocket event (if socket service available)
  - Validates transitions (prevent invalid state changes)
- `getStatusHistory(messageId, orgId, options)` - Get timeline with pagination
- `getStatusMetrics(orgId?)` - Distribution, transitions, reason breakdown
- `recordReceiptUpdate()` - Called from delivery receipts system
- `recordDlqTransfer()` - When message moved to DLQ
- `recordSystemStatusChange()` - For automated status updates
- Health metrics: `getStatusHealth()` returns status counts

### ✅ Public API

**File**: `backend/src/lib/message-status-tracking/index.ts` (45 lines)

Exports:
- `updateMessageStatus()`
- `getStatusHistory()`
- `getStatusMetrics()`
- `getStatusHealth()`
- Types and interfaces

### ✅ Admin API Routes

**File**: `backend/src/app/api/message-status-tracking/route.ts` (280 lines)

Endpoints (protected by `auth` + `orgGuard`, SUPER_ADMIN effective):

#### GET `/admin/messages/:messageId/history`
- Get full status timeline for a message
- Query params: `?limit=50&offset=0`
- Returns chronological history entries

#### POST `/admin/messages/:messageId/status`
- Manually update message status (with audit trail)
- Body: `{ status: "DELIVERED", reason: "manual", metadata: { ... } }`
- Validates status is valid and transitions allowed
- Records history with `changedBy = user.id`

#### GET `/admin/status-metrics`
- Get status distribution and transition metrics
- Query params: `?orgId=org_123` (optional, global if omitted)
- Returns: `{ totalMessages, distribution, transitions, byReason, updatedAt }`

#### GET `/admin/status-health`
- Quick health check: counts by status
- Used for dashboard summaries

---

## What's Remaining

### 🔄 WebSocket Integration (50% done)

**Planned file**: `backend/src/lib/websocket-status-integration.ts` (or integrate into existing socket service)

Tasks:
- [ ] Import WebSocket service (already exists at `backend/src/lib/socket.service.ts`)
- [ ] Create `emitStatusChange(messageId, orgId, oldStatus, newStatus, metadata)` function
- [ ] Wire into `status-manager.ts` → every `updateMessageStatus()` emits event
- [ ] Event format:
  ```typescript
  {
    type: 'status_update',
    messageId,
    orgId,
    status,
    oldStatus,
    changedAt,
    changedBy,
    reason,
    metadata
  }
  ```
- [ ] Emit to room: `socket.to(`org:${orgId}`).emit(...)`
- [ ] Document WebSocket event for frontend consumption

### 🔄 Metrics Enhancement (0% done)

**To extend**: `backend/src/lib/create-comprehensive-metrics-dashboard-(grafana)/index.ts`

Add metrics:
- [ ] `message_status_distribution` - Gauge (labels: `status`, `org_id`)
- [ ] `message_status_transition_total` - Counter (labels: `from`, `to`)
- [ ] `message_status_update_duration_seconds` - Histogram (labels: `reason`)
- [ ] `message_status_history_entries_total` - Counter (labels: `message_id`)

Wire into `status-manager.ts`:
- Increment distribution gauge on every status change
- Increment transition counter with `from` → `to` labels
- Time the update operation and observe duration

### 🔄 Queue Integration (50% done)

**Already integrated**: `consumer.ts` calls `recordSystemStatusChange()` on job completion/failure
- Need to verify it's working correctly
- May need to add more status updates during processing lifecycle:
  - Job picked up → `PROCESSING` (or keep `SENDING`?)
  - Job completed → `SENT` or `DELIVERED` based on type
  - Job failed → `FAILED`

### 🔄 Delivery Receipts Hook (0% done)

**File to modify**: `backend/src/lib/integrate-evolution-api-message-status-webhooks/validator.ts`

The delivery receipts system updates `WhatsAppMessage` directly. Need to:
- [ ] Import `status-manager.ts`
- [ ] Replace direct `prisma.whatsAppMessage.update()` calls with `recordReceiptUpdate()`
- [ ] Ensure every receipt update also creates history entry
- [ ] Verify WebSocket events fire

### 🔄 Testing

**Unit tests needed** (estimated 12-15 tests):
- [ ] `updateMessageStatus()` success cases
- [ ] Transition validation (invalid transitions throw errors)
- [ ] History pagination and filtering
- [ ] Metrics computation (distribution, transitions)
- [ ] Health check aggregation
- [ ] WebSocket emission (mock socket service)
- [ ] Permission checks (org guard)

**Integration tests needed** (estimated 6 scenarios):
- [ ] Status update via admin API creates history entry
- [ ] Webhook-triggered status change (from delivery receipts) creates history
- [ ] Queue-triggered status change (job completion) creates history
- [ ] Invalid status transition rejected with 400
- [ ] WebSocket event received by connected client
- [ ] Metrics reflect correct counts after multiple updates

---

## Files Created So Far

### New Files (4)
```
backend/prisma/schema.prisma (modified - added MessageStatusHistory model)
backend/src/lib/message-status-tracking/types.ts
backend/src/lib/message-status-tracking/status-manager.ts
backend/src/lib/message-status-tracking/index.ts
backend/src/app/api/message-status-tracking/route.ts
```

### Modified Files (0 so far, awaiting queue/receipts integration)

---

## How to Test Current Implementation

### 1. Apply Database Migration
```bash
cd backend
npx prisma migrate dev --name add-message-status-history
# Or generate SQL: npx prisma migrate diff --from-url ... --to-schema-datamodel ./prisma/schema.prisma --script > migration.sql
```

### 2. Start Server
```bash
npm run dev
# Server should start on port 9403
```

### 3. Test Admin API Endpoints

```bash
# Get metrics (replace orgId with real org)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9403/admin/status-metrics?orgId=org_123"

# Get message history (replace messageId with real ID)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9403/admin/messages/msg_123/history"

# Update status manually
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DELIVERED","reason":"manual","metadata":{"note":"test"}}' \
  "http://localhost:9403/admin/messages/msg_123/status"
```

---

## Next Steps to Complete Step 2

1. **WebSocket Integration** (1-2 hours)
   - Create `websocket-status-integration.ts` utility
   - Emit events from status manager
   - Test with WebSocket client

2. **Metrics Extension** (1 hour)
   - Add 4 new Prometheus metrics
   - Wire into status manager
   - Verify `/metrics` output

3. **Queue Integration Verification** (30 min)
   - Test that job completion updates status correctly
   - Ensure history entries created
   - May need to adjust status values (SENDING → SENT vs DELIVERED)

4. **Delivery Receipts Hook** (1 hour)
   - Modify `validator.ts` in receipts system
   - Replace direct updates with status manager calls
   - Preserve existing receipt behavior while adding history

5. **Testing** (2-3 hours)
   - Write 12+ unit tests
   - Write 6 integration tests
   - Ensure coverage > 85%

6. **Documentation**
   - Create `PHASE3_STEP2_COMPLETE.md` with full details
   - Document WebSocket event format for frontend
   - Update API docs with status endpoints

---

## Design Rationale

### Why Separate History Table?
- **Audit Trail**: Immutable record of all status changes (who changed what and when)
- **Compliance**: Required for enterprise customers to trace message lifecycle
- **Debugging**: See full timeline, not just current state
- **Analytics**: Compute transition rates, time-in-status, drop-off points

### Why Centralized Status Manager?
- **Single Source of Truth**: All status changes go through one API
- **Consistency**: Enforces valid transitions (PENDING → SENDING → SENT → DELIVERED → READ)
- **Side Effects**: Guarantees WebSocket events, metrics, and history always fire
- **Flexibility**: Can be called from queue workers, webhook handlers, admin APIs

### Why WebSocket Notifications?
- **Realtime UI**: Frontend dashboard updates instantly when status changes
- **No Polling**: Reduces server load vs client polling every few seconds
- **Multi-User**: Org members all see updates in shared org room

---

## Estimated Completion Timeline

| Task | Time | Status |
|------|------|--------|
| Database migration | 30 min | ✅ (schema done) |
| Status manager core | 2 hours | ✅ Complete |
| Admin API | 1 hour | ✅ Complete |
| WebSocket integration | 1-2 hours | 🔄 Pending |
| Queue integration | 30 min | 🔄 Partial |
| Receipts integration | 1 hour | 🔄 Pending |
| Metrics extension | 1 hour | 🔄 Pending |
| Unit tests | 2 hours | 🔄 Pending |
| Integration tests | 2 hours | 🔄 Pending |
| Documentation | 1 hour | 🔄 Pending |
| **Total** | **~11 hours** | **60% done** |

---

## Related Systems

- **Delivery Receipts** (Phase 2 Step 5): Already updates status, needs to use status manager instead of direct DB updates
- **Message Queue** (Phase 3 Step 1): Workers should call `updateMessageStatus()` on job events
- **WebSocket Service** (existing): Need to emit status change events to connected clients
- **Metrics Dashboard** (Phase 2 Step 8): Status metrics to be added

---

**Started**: 2026-03-17
**Estimated Completion**: 1-2 days (11 hours of focused work)
**Dependencies**: Prisma migration applied, WebSocket service running
**Next Immediate Task**: WebSocket integration in `status-manager.ts`
