# Phase 1, Step 14: Instance Heartbeat Monitoring - Research

**Date:** 2025-03-17
**Author:** Claude (Anthropic)
**Topic:** Instance heartbeat monitoring best practices, Redis TTL patterns, health status tracking

---

## 1. Heartbeat Monitoring Patterns

### 1.1 Push vs Pull

**Push Model (Recommended)**
- WhatsApp instances proactively call an endpoint (e.g., `POST /admin/instances/:id/heartbeat`)
- Server updates `lastSeen` timestamp (in Redis or PostgreSQL)
- **Advantages:** Simpler, more scalable, no polling overhead, real-time updates
- **Disadvantages:** Requires instances to implement the client
- **Our choice:** ✓ Push model (instances are our controlled backend services)

**Pull Model**
- Server periodically polls each instance via HTTP/ICMP
- Detects unresponsive instances
- **Advantages:** Works without client cooperation
- **Disadvantages:** Network overhead, firewall issues, false positives from network latency
- **Not recommended** for our use case (we control the instances)

---

## 2. Storage Strategy: Redis vs PostgreSQL

### 2.1 Redis with TTL (Recommended for Real-time)

**Pattern:**
```typescript
// Set heartbeat key with TTL (expires if no updates)
await redis.set(
  `heartbeat:${instanceId}`,
  timestamp,  // current ISO string or Unix timestamp
  'EX',       // expiration in seconds
  90          // TTL = 3 * heartbeat_interval (30s interval → 90s TTL)
);
```

**How to check status:**
```typescript
// Instance is ONLINE if key exists
const exists = await redis.exists(`heartbeat:${instanceId}`); // 0 or 1
```

**How to list all instances with status:**
```typescript
// Scan all heartbeat keys
const stream = redis.scanStream({ match: 'heartbeat:*', count: 100 });
const onlineInstances = new Set<string>();

stream.on('data', async (keys) => {
  for (const key of keys) {
    const instanceId = key.split(':')[1];
    const lastSeen = await redis.get(key);
    onlineInstances.add(instanceId);
    // Store lastSeen for display
  }
});

await new Promise((resolve) => stream.on('end', resolve));
```

**Advantages:**
- Automatic expiration via TTL - no cleanup job needed
- O(1) checks for individual instances
- Efficient scanning with `SCAN` (non-blocking)
- Low memory footprint

**Disadvantages:**
- Data is ephemeral (lost on Redis restart unless AOF/RDB persistence enabled)
- Need separate persistence if historical uptime data required

**Mitigation:**
- Enable Redis AOF (Append Only File) for durability
- Periodically sync heartbeat data to PostgreSQL for long-term analytics (optional)

### 2.2 PostgreSQL Persistent Storage

**Pattern:**
```sql
-- Add columns to WhatsAppInstance
ALTER TABLE "WhatsAppInstance" ADD COLUMN "lastSeen" TIMESTAMP;
ALTER TABLE "WhatsAppInstance" ADD COLUMN "status" VARCHAR(20) DEFAULT 'UNKNOWN';
```

**Update heartbeat:**
```typescript
await prisma.whatsAppInstance.update({
  where: { id: instanceId },
  data: { lastSeen: new Date(), status: 'ONLINE' }
});
```

**Status calculation:**
```typescript
const THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const instance = await prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });

let status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
if (!instance.lastSeen) {
  status = 'UNKNOWN';
} else if (Date.now() - instance.lastSeen.getTime() < THRESHOLD_MS) {
  status = 'ONLINE';
} else {
  status = 'OFFLINE';
}
```

**Advantages:**
- Persistent, survives restarts
- Historical data for SLA/uptime calculations
- Easy queries with Prisma
- RLS integration (tenant isolation)

**Disadvantages:**
- No automatic expiration (need cron job to mark stale instances as OFFLINE)
- Higher write load on database
- Need to query all instances periodically to update status

**Mitigation:**
- Use background job (every 30s) to update statuses based on `lastSeen`
- Index on `lastSeen` for efficient queries

### 2.3 Hybrid Approach (Recommended)

Combine both:
1. **Real-time:** Redis TTL for instant online/offline detection (sub-second)
2. **Persistent:** PostgreSQL `lastSeen` for historical tracking and admin UI

**Implementation:**
```typescript
// Heartbeat endpoint updates both
export async function recordHeartbeat(instanceId: string): Promise<void> {
  const now = new Date().toISOString();

  // Redis (real-time, auto-expire)
  await redis.set(`heartbeat:${instanceId}`, now, 'EX', 90);

  // PostgreSQL (persistent)
  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: { lastSeen: now }
  });
}
```

**Background sync (every 30s):**
```typescript
// Scan Redis heartbeats, update PostgreSQL status
const onlineInstances = new Set<string>();
const stream = redis.scanStream({ match: 'heartbeat:*' });
// ... collect all instance IDs

// Bulk update: mark online, others offline
await prisma.$transaction([
  // Set all to OFFLINE first
  prisma.whatsAppInstance.updateMany({
    data: { status: 'OFFLINE' }
  }),
  // Set online ones to ONLINE
  ...onlineInstances.map(id =>
    prisma.whatsAppInstance.update({
      where: { id },
      data: { status: 'ONLINE' }
    })
  )
]);
```

---

## 3. Health Status States and Thresholds

### 3.1 State Definitions

| State | Definition | Detection Logic |
|-------|------------|-----------------|
| **ONLINE** | Instance sent heartbeat within threshold | `lastSeen` exists AND `now - lastSeen < ONLINE_THRESHOLD` |
| **OFFLINE** | Instance missed heartbeat beyond timeout | `lastSeen` exists BUT `now - lastSeen >= OFFLINE_THRESHOLD` |
| **UNKNOWN** | Instance never sent heartbeat | `lastSeen` is NULL |
| **DEGRADED** (optional) | Instance responding but with errors | Heartbeat includes error metrics (CPU, memory, queue backlog) |

### 3.2 Threshold Configuration

**Recommended values:**
- Heartbeat interval: **30 seconds** (instances call heartbeat every 30s)
- TTL: **90 seconds** (3 * interval) - ensures stale heartbeats expire
- Online threshold: **60 seconds** (2 * interval) - mark as OFFLINE if lastSeen > 60s old
- Offline threshold: **90 seconds** (3 * interval) - grace period before final OFFLINE

**Configuration by org/instance:**
- May vary based on instance criticality
- Store thresholds in instance config or org settings
- Default to system-wide values

---

## 4. API Design

### 4.1 Heartbeat Endpoint (Instance → Server)

**POST `/admin/instances/:id/heartbeat`**

**Purpose:** Instance registers its liveness

**Authentication:**
- Option A: Instance API key (like `X-Instance-Token` header)
- Option B: JWT with `INSTANCE` role (if instances authenticate)
- **Recommended:** Simple API key (no JWT overhead) because instances are backend services

**Request:**
```json
{
  "metrics": {
    "cpu": 0.45,
    "memory": 0.67,
    "queueSize": 120,
    "uptime": 86400
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "instanceId": "inst_123",
    "status": "ONLINE",
    "serverTime": "2025-03-17T12:34:56Z"
  }
}
```

**Logic:**
1. Verify instance exists and belongs to calling instance's org (via token lookup)
2. Record heartbeat in Redis (`setex heartbeat:{id} 90 timestamp`)
3. Update PostgreSQL `WhatsAppInstance.lastSeen` and optionally `status = 'ONLINE'`
4. Store metrics in Redis hash `heartbeat:metrics:{id}` for monitoring UI

### 4.2 Status List Endpoint (Admin Dashboard)

**GET `/admin/instances/heartbeat`**

**Authentication:** SUPER_ADMIN or ORG_ADMIN

**Query Parameters:**
- `status` (optional): Filter by `ONLINE|OFFLINE|UNKNOWN`
- `orgId` (optional for SUPER_ADMIN, required for ORG_ADMIN to see other orgs)

**Response:**
```json
{
  "success": true,
  "data": {
    "instances": [
      {
        "id": "inst_123",
        "name": "Production WhatsApp",
        "phoneNumber": "+1234567890",
        "orgId": "org_abc",
        "orgName": "Acme Corp",
        "status": "ONLINE",
        "lastSeen": "2025-03-17T12:34:30Z",
        "uptime": 86400,
        "metrics": {
          "cpu": 0.45,
          "memory": 0.67,
          "queueSize": 120
        }
      }
    ],
    "summary": {
      "total": 10,
      "online": 8,
      "offline": 2,
      "unknown": 0
    }
  }
}
```

**Implementation:**
- Scan Redis `heartbeat:*` keys to determine online instances (fast)
- Query PostgreSQL for instance details (name, phone, org) with RLS filtering
- Merge data: instance metadata from DB, online status from Redis key existence
- Apply status filter and return

### 4.3 Real-time Updates (Optional - Future Enhancement)

**WebSocket/SSE** for live dashboard:
- Admin connects to `/admin/instances/heartbeat/stream`
- Server sends updates when instance status changes (ONLINE → OFFLINE)
- Could use `Redis Pub/Sub` on heartbeat key expirations

**Implementation complexity:** Medium
**Benefit:** Real-time monitoring without polling
**Defer to:** Phase 3 or later if needed

---

## 5. Background Jobs

### 5.1 Status Sync Job (Every 30 seconds)

**Purpose:** Periodically update PostgreSQL `status` column based on Redis heartbeats

**Why needed:**
- Redis tells us who is online (keys exist)
- PostgreSQL `status` field needs to be kept in sync for queries (e.g., "show all offline instances")
- Avoid querying Redis for every admin list request (merge cost)

**Algorithm:**
```typescript
async function syncInstanceStatuses(): Promise<void> {
  const now = Date.now();
  const ONLINE_THRESHOLD = 60 * 1000; // 60 seconds
  const stream = redis.scanStream({ match: 'heartbeat:*', count: 100 });
  const onlineInstances = new Set<string>();

  // Collect all online instance IDs from Redis
  for await (const keys of stream) {
    for (const key of keys) {
      const instanceId = key.split(':')[1];
      const lastSeenStr = await redis.get(key);
      const lastSeen = parseInt(lastSeenStr, 10);

      if (now - lastSeen < ONLINE_THRESHOLD) {
        onlineInstances.add(instanceId);
      }
    }
  }

  // Bulk update PostgreSQL
  await prisma.$transaction(async (tx) => {
    // 1. Mark all instances as OFFLINE (within org RLS context)
    await tx.whatsAppInstance.updateMany({
      data: { status: 'OFFLINE' }
    });

    // 2. Mark online instances as ONLINE
    for (const id of onlineInstances) {
      await tx.whatsAppInstance.update({
        where: { id },
        data: { status: 'ONLINE' }
      });
    }
  });
}
```

**Schedule with BullMQ:**
```typescript
queue.add(
  'sync-instance-status',
  {},
  { repeat: { cron: '*/30 * * * * *' } } // Every 30 seconds
);
```

**Considerations:**
- Must set RLS context before queries (QuotaLimiter pattern)
- Use `$transaction` for atomicity
- Handle large numbers of instances efficiently (bulk operations)

### 5.2 Metrics Aggregation Job (Hourly/Daily)

**Purpose:** Compute uptime percentages, detect flapping

**Future enhancement** - not needed for MVP

---

## 6. Implementation Plan

### 6.1 Database Schema Changes

**Option 1: Add to existing `WhatsAppInstance`**
```sql
ALTER TABLE "WhatsAppInstance" ADD COLUMN "lastSeen" TIMESTAMP;
ALTER TABLE "WhatsAppInstance" ADD COLUMN "status" VARCHAR(20) DEFAULT 'UNKNOWN';
```

**Option 2: Create new `InstanceHeartbeat` table (if we want history)**
```sql
CREATE TABLE "InstanceHeartbeat" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "instanceId" UUID NOT NULL REFERENCES "WhatsAppInstance"("id"),
  "receivedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "metrics" JSONB
);
```

**Decision:** Option 1 (simpler, sufficient for MVP). Add columns to existing table.

### 6.2 Prisma Schema Update

```prisma
model WhatsAppInstance {
  // ... existing fields ...

  lastSeen DateTime? @map("last_seen")
  status    String?   @default("UNKNOWN") // ONLINE|OFFLINE|UNKNOWN

  @@map("WhatsAppInstance")
}
```

Run: `npx prisma migrate dev --name add-heartbeat-fields`

### 6.3 Core Library Structure

```
src/lib/implement-instance-heartbeat-monitoring/
├── types.ts            # Interfaces: Heartbeat, InstanceStatus, Metrics
├── storage.ts          # Redis + PostgreSQL operations (set, get, scan, sync)
├── status.ts           # Status calculation logic (online/offline/unknown)
├── scheduler.ts        # BullMQ job for periodic sync
└── index.ts            # Public API: recordHeartbeat(), getInstanceStatuses()
```

**Max 250 lines total** - keep each file focused.

### 6.4 API Routes

```
src/app/api/implement-instance-heartbeat-monitoring/
├── route.ts            # GET /admin/instances/heartbeat, POST /admin/instances/:id/heartbeat
└── validate.ts         # Zod schemas (optional if simple)
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

- `status.ts`: Test online/offline/unknown threshold logic
- `storage.ts`: Test Redis operations with ioredis mock
- `scheduler.ts`: Test BullMQ job configuration

### 7.2 Integration Tests

- POST `/admin/instances/:id/heartbeat` with valid token → updates Redis and DB
- GET `/admin/instances/heartbeat` with SUPER_ADMIN → returns list with status
- RLS isolation: ORG_ADMIN only sees own org instances
- Quota middleware integration (should not be affected)
- Rate limiting (should not block heartbeats if frequent)

---

## 8. References

- [Heartbeat Design Pattern — Smart Health Devices](https://medium.com/@mehul25/system-design-for-monitoring-smart-health-devices-96aa0c61191d)
- [Redis-Powered Session Tracking with Heartbeat](https://medium.com/tilt-engineering/redis-powered-user-session-tracking-with-heartbeat-based-expiration-c7308420489f)
- [Real-Time Reliability: Client-Server Heartbeats in Chat App](https://medium.com/@onakoyak/real-time-reliability-using-client-server-heartbeats-to-ensure-consistent-online-status-in-chat-429ae3c2d94a)
- [ioredis scanStream documentation](https://context7.com/redis/ioredis)
- [Azure Health Check Guidelines](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check)
- [AWS Auto Scaling Health Checks](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-health-checks.html)

---

## 9. Decision Matrix

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| Storage | Redis TTL | ✓ | Auto-expire, real-time, efficient scanning |
| Storage | PostgreSQL | Also ✓ | Persistent history, queryable |
| Model | Push | ✓ | Simpler, scalable, instances controlled |
| Status update | Background job | ✓ | Keeps DB in sync without per-request overhead |
| Instance auth | API key | ✓ | Lightweight for backend services |
| Real-time UI | Polling (initial) | ✓ | Simpler, defer WebSocket to later |

---

**End of Research Document**
