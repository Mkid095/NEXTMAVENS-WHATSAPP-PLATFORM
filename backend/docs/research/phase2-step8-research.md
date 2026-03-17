# Phase 2 Step 8 Research: Comprehensive Metrics Dashboard (Grafana)

**Date:** March 17, 2026  
**Objective:** Design and implement a production-grade metrics collection and visualization system using Prometheus + Grafana for the WhatsApp messaging platform.

---

## Executive Summary

We will instrument the Node.js/Fastify backend with **prom-client** to expose Prometheus metrics at `/metrics` endpoint. A separate Prometheus server will scrape these metrics, store them in its time-series database, and Grafana will query Prometheus for visualization. We'll create pre-built dashboards covering:

- **Infrastructure metrics** (CPU, memory, disk, network)
- **Application metrics** (HTTP requests, latency, errors)
- **Business metrics** (queue depth, message throughput, instance health, deduplication rates)
- **Alerting rules** for critical thresholds

---

## Architecture

```
┌─────────────┐    Scrape    ┌──────────────┐    Query    ┌─────────┐
│  Fastify    │─────────────▶│  Prometheus  │───────────▶│ Grafana │
│  Backend    │   /metrics   │   Server     │   PromQL   │ Dashboard│
│ (prom-client)│             │ (TSDB)       │            │         │
└─────────────┘              └──────────────┘            └─────────┘
        │                                                        │
        │                                                        ▼
        │                                                ┌─────────────┐
        │                                                │   Alerts    │
        │                                                │   Engine    │
        └────────────────────────────────────────────────▶│  (Email,    │
                                                         │   Slack)   │
                                                         └─────────────┘
```

**Data Flow:**
1. `prom-client` collects metrics in-process (counters, gauges, histograms)
2. Fastify exposes `/metrics` endpoint (text format for Prometheus)
3. Prometheus scrapes `/metrics` every 15s, stores in TSDB
4. Grafana queries Prometheus via PromQL, renders dashboards
5. Prometheus Alertmanager sends notifications when thresholds violated

---

## Library Selection

### Prometheus Client for Node.js: `prom-client`

**Chosen:** `/siimon/prom-client` (88.7 benchmark score, actively maintained)

**Why:**
- Native TypeScript support (no @types needed)
- Full support for Counter, Gauge, Histogram, Summary, Registry
- Built-in default metrics (Node.js memory, CPU, event loop)
- Registry allows collecting from multiple sources (Prisma, application code)
- Small bundle size (~50KB), zero runtime dependencies

**Alternatives considered:**
- `express-prom-bundle`: Bundles many metrics by default, but limited customization (rejected)
- Manual PromQL string building: Too low-level, error-prone (rejected)

### Installation

```bash
cd backend
npm install prom-client
```

---

## Metric Types & Use Cases

| Metric Type | Use Case | Example |
|-------------|----------|---------|
| **Counter** | Monotonically increasing count (total requests, errors) | `http_requests_total` |
| **Gauge** | Snapshot value (current queue depth, active connections) | `queue_jobs_active` |
| **Histogram** | Distribution of durations (latency, processing time) | `http_request_duration_seconds` |
| **Summary** | Similar to histogram but with quantiles (rarely needed) | - |

---

## Metrics to Instrument

### 1. HTTP/API Layer

**Metrics:**

- `http_requests_total` (counter) - Total HTTP requests
  - Labels: `method`, `route`, `status_code`, `org_id` (optional)
- `http_request_duration_seconds` (histogram) - Request latency
  - Labels: `method`, `route`, `status_code`
  - Buckets: `[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`
- `http_active_connections` (gauge) - Currently open HTTP connections
- `http_errors_total` (counter) - Unhandled errors (5xx)
  - Labels: `error_type`, `route`

**Implementation:** Fastify `onRequest`/`onResponse` hooks

---

### 2. Message Queue System

**Metrics:**

- `queue_jobs_total` (counter) - Jobs added to queue
  - Labels: `message_type`, `priority`
- `queue_jobs_active` (gauge) - Currently processing jobs
- `queue_jobs_completed_total` (counter) - Successfully processed
- `queue_jobs_failed_total` (counter) - Failed (moved to DLQ)
  - Labels: `failure_type` (`timeout`, `api_error`, `validation`)
- `queue_jobs_retry_total` (counter) - Retry attempts made
- `queue_dlq_size` (gauge) - Dead letter queue backlog
- `queue_worker_active` (gauge) - Number of active workers
- `queue_processing_duration_seconds` (histogram) - Time from enqueue to completion
  - Labels: `message_type`

**Implementation:** Instrument `message-queue-priority-system/index.ts` (add and completeJob)

---

### 3. Instance Heartbeat Monitoring

**Metrics:**

- `instance_heartbeat_total` (counter) - Heartbeats received
  - Labels: `status` (`online`, `offline`)  
- `instance_currently_online` (gauge) - Count of online instances
  - Labels: `organisation_id` (optional for filtering)
- `instance_heartbeat_age_seconds` (gauge) - Age of last heartbeat (for SLA)
- `instance_background_sync_duration_seconds` (histogram) - Background job sync latency

**Implementation:** Instrument `implement-instance-heartbeat-monitoring/storage.ts` and `scheduler.ts`

---

### 4. WhatsApp API Interactions

**Metrics:**

- `whatsapp_api_requests_total` (counter) - Calls to WhatsApp API
  - Labels: `endpoint`, `method`, `status_code`
- `whatsapp_api_request_duration_seconds` (histogram) - Latency
- `whatsapp_api_errors_total` (counter) - WhatsApp API errors
  - Labels: `error_code`, `error_type`
- `whatsapp_messages_sent_total` (counter) - Successfully sent messages
  - Labels: `message_type` (`text`, `image`, `document`, etc.)
- `whatsapp_message_status_updates_total` (counter) - Status callbacks received
  - Labels: `status` (`sent`, `delivered`, `read`, `failed`)

**Implementation:** Wrap WhatsApp API client (`lib/whatsapp-api-client/` or similar)

---

### 5. Database (Prisma)

**Metrics:**

- `prisma_queries_total` (counter) - Database queries executed
  - Labels: `operation` (`findUnique`, `findMany`, `create`, `update`, `delete`), `model`
- `prisma_query_duration_seconds` (histogram) - Query latency
- `prisma_errors_total` (counter) - Database errors
  - Labels: `error_code`, `code_name`
- `prisma_connection_pool_used` (gauge) - Active DB connections
- `prisma_connection_pool_available` (gauge) - Available connections in pool

**Implementation:** Use Prisma's built-in `prometheus()` metrics or instrument manually

**Prisma integration:**
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Enable Prisma metrics
prisma.$on('beforeExit', async () => {
  const metrics = await prisma.$metrics.prometheus();
  // Add to Prometheus registry
});
```

Better: Use `prisma.$metrics` in a custom collector.

---

### 6. Redis

**Metrics:**

- `redis_commands_total` (counter) - Redis commands executed
  - Labels: `command` (`GET`, `SET`, `ZPOPMAX`, etc.)
- `redis_command_duration_seconds` (histogram) - Command latency
- `redis_connections_active` (gauge) - Active Redis connections
- `redis_memory_usage_bytes` (gauge) - Memory consumed
- `redis_hits_total` / `redis_misses_total` - Cache hit rate (if using cache)

**Implementation:** Wrap `ioredis` client with instrumentation

**Redis wrapper:**
```typescript
const originalGet = redis.get;
redis.get = async function (key, ...args) {
  const end = redisCommandTimer.startTimer({ command: 'GET' });
  try {
    const result = await originalGet.call(this, key, ...args);
    redisCommandSuccessCounter.inc({ command: 'GET' });
    return result;
  } catch (error) {
    redisCommandErrorsCounter.inc({ command: 'GET' });
    throw error;
  } finally {
    end();
  }
};
```

---

### 7. Node.js Process Metrics (Built-in)

**Already covered by `collectDefaultMetrics()`:**

- `process_cpu_seconds_total` - CPU time
- `nodejs_memory_usage_bytes` - RSS, heapTotal, heapUsed, external
- `nodejs_eventloop_lag_seconds` - Event loop delay
- `nodejs_active_handles_total` - Open handles
- `nodejs_active_requests_total` - Active async operations

---

## Implementation Plan

### Step 1: Create Metrics Library

**Directory:** `backend/src/lib/create-comprehensive-metrics-dashboard-(grafana)/`

Files:
- `index.ts` - Main metrics collector, aggregates all metrics
- `collectors/` - Individual collectors (http, queue, heartbeat, whatsapp, redis, prisma)
- `types.ts` - Metric definitions and label types
- `metrics.ts` - Actual Counter/Gauge/Histogram instances

**Pattern:**
```typescript
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Collect Node.js defaults every 10 seconds
collectDefaultMetrics({ prefix: 'nodejs_' });

// Custom metrics
const httpRequestsTotal = new Counter({
  name: 'whatsapp_platform_http_requests_total',
  help: 'Total HTTP requests processed',
  labelNames: ['method', 'route', 'status_code']
});

// Export for use in other files
export function incrementHttpRequest(method: string, route: string, statusCode: number) {
  httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
}

// Endpoint to expose metrics
fastify.get('/metrics', async (request, reply) => {
  reply.type(register.contentType);
  return await register.metrics();
});
```

---

### Step 2: Instrument Code

Server-wide HTTP middleware:
```typescript
fastify.addHook('onRequest', (req, reply, done) => {
  // Track active connections
  activeConnectionsGauge.inc();
  done();
});

fastify.addHook('onResponse', (req, reply, done) => {
  activeConnectionsGauge.dec();
  
  const route = req.routeOptions?.path || req.raw.url || 'unknown';
  const status = reply.statusCode;
  
  httpRequestsTotal.inc({ method: req.method, route, status_code: status.toString() });
  
  if (reply.parser._context) {
    const latency = Date.now() - req.raw._startTime;
    httpRequestDuration.observe({ method: req.method, route, status_code: status.toString() }, latency / 1000);
  }
  
  done();
});
```

---

### Step 3: Docker Compose for Monitoring Stack

**File:** `docker-compose.monitoring.yml`

Services:
1. **Prometheus** - Scrapes metrics, stores TSDB
   - Config: `prometheus/prometheus.yml` (scrape interval 15s)
2. **Grafana** - Dashboard visualization
   - Port: 3000
   - Volumes: grafana-storage, pre-provisioned dashboards
3. **Node Exporter** - Host system metrics (CPU, memory, disk, network)
   - Optional: we already have Node.js process metrics

**Prometheus config:**
```yaml
scrape_configs:
  - job_name: 'whatsapp-platform'
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:3000']  # Assuming backend container
```

---

### Step 4: Create Grafana Dashboard

**Dashboard JSON:** `backend/docs/grafana/dashboard.json`

We'll design a multi-row dashboard:

#### Row 1: System Overview
- Node.js memory usage (RSS, heap)
- CPU usage (user, system)
- Event loop lag
- Active handles

#### Row 2: HTTP Traffic
- Requests per second (rate)
- Request rate by status code (200, 4xx, 5xx)
- P95/P99 latency
- Active connections

#### Row 3: Message Queue Health
- Jobs in queue (by priority)
- Throughput (jobs/sec)
- Job duration (p50, p95, p99)
- DLQ size
- Worker active count

#### Row 4: Instance Health
- Online instances count (total, by org)
- Heartbeat age distribution
- Instances with stale heartbeat (> 2 min)

#### Row 5: WhatsApp API
- API requests/sec
- Error rate (5xx from WhatsApp)
- Message send success rate
- Rate limit hits

#### Row 6: Database (Prisma)
- Queries/sec
- Query latency (p95)
- Connection pool usage (used vs available)
- Query errors

#### Row 7: Redis
- Memory usage
- Commands/sec (GET, SET, ZPOPMAX)
- Command latency
- Connected clients

---

### Step 5: Define Alerts

**Alerting rules** (`prometheus/alert-rules.yml`):

| Alert | Condition | Severity | Notification |
|-------|-----------|----------|--------------|
| `QueueBacklogHigh` | `queue_jobs_active > 1000` | warning | Slack/email |
| `DLQGrowing` | `rate(queue_jobs_failed_total[5m]) > 10` | critical | PagerDuty |
| `InstanceOffline` | `instance_currently_online < expected_count` | critical | SMS |
| `HighErrorRate` | `rate(http_errors_total[5m]) / rate(http_requests_total[5m]) > 0.05` | warning | Email |
| `WhatsAppAPIDown` | `rate(whatsapp_api_errors_total[2m]) > 20` | critical | SMS/PagerDuty |
| `DatabaseConnectionsExhausted` | `prisma_connection_pool_used / prisma_connection_pool_available > 0.9` | warning | Email |
| `RedisMemoryFull` | `redis_memory_usage_bytes / redis_maxmemory_bytes > 0.85` | critical | Email/SMS |

---

### Step 6: Test & Validate

**Test strategy:**
1. Load test to generate traffic → verify metrics appear in Prometheus
2. Simulate failures (DB down, Redis down) → verify alerts fire
3. Check Grafana dashboard real-time updates
4. Verify metrics accuracy by comparing with logs/manual checks
5. Performance impact: Metrics collection should add <2% overhead

**Automated tests:**
- Unit: Verify metric creation and increment/decrement
- Integration: Generate sample requests, query `/metrics` endpoint, parse Prometheus format, assert expected values

---

## References

- [Prometheus Docs - Best Practices](https://prometheus.io/docs/practices/instrumentation/)
- [Grafana Dashboard Design Tips](https://grafana.com/docs/grafana/latest/dashboards/)
- [prom-client GitHub](https://github.com/siimon/prom-client)
- [PromQL Tutorial](https://prometheus.io/docs/prometheus/latest/querying/basics/)

---

## Deliverables

✅ `backend/src/lib/create-comprehensive-metrics-dashboard-(grafana)/`  
✅ Prometheus scrape config (`docker-compose.monitoring.yml`, `prometheus.yml`)  
✅ Grafana dashboard JSON (`backend/docs/grafana/dashboard.json`)  
✅ Alerting rules (`backend/docs/monitoring/alert-rules.yml`)  
✅ Documentation: Monitoring setup guide (`backend/docs/MONITORING.md`)  
✅ Tests: Unit + integration for metrics collection  
✅ Report: `reports/phase2-step8-report.md`

---

## Questions for Implementation

1. **Multi-instance Redis metrics:** How to aggregate across multiple Node.js instances?
   - Solution: Prometheus scrapes each instance separately, then aggregates using `sum(metric) by (job)`

2. **Metrics retention:** How long to keep data?
   - Default: 15 days for high-res (15s intervals), 90 days for downsampled

3. **Sensitive data leakage:** Ensure metrics don't expose PII or secrets
   - Use label values carefully (avoid phone numbers, message content)

4. **Security of `/metrics` endpoint:**
   - Expose only on internal network (not public internet)
   - Or protect with basic auth / IP whitelist if public

---

## Research Conclusion

Using `prom-client` for instrumentation + Prometheus + Grafana is the industry standard approach. The implementation is straightforward, well-documented, and scales to thousands of metrics with minimal overhead. The main work will be in creating comprehensive dashboard panels and alerting rules tailored to our business domain (WhatsApp messaging platform).

