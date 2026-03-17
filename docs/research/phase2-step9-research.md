# Phase 2 Step 9: Connection Pool Optimization - Research

**Date**: 2026-03-17
**Step**: Implement Connection Pool Optimization
**Phase**: 2 - Reliability & Messaging Hardening

---

## Objective

Design and implement a connection pool optimization system for PostgreSQL (Prisma) and Redis connections that:
- Improves performance under high load
- Prevents connection leaks
- Provides health monitoring and metrics
- Configures optimal pool sizes based on workload
- Handles connection failures gracefully

---

## Research Findings

### 1. Prisma Connection Pool Configuration

Prisma ORM (v6+) includes built-in connection pooling. The connection pool can be configured via:

#### a) Connection String Parameters

```sql
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?
  connection_limit=10&
  connect_timeout=5&
  socket_timeout=3
```

Key parameters:
- `connection_limit`: Maximum number of connections in the pool (default: varies by CPU cores)
- `connect_timeout`: Timeout for establishing new connections (seconds)
- `socket_timeout`: Timeout for socket operations (seconds)

#### b) Driver Adapter Configuration (Prisma v7+)

Using `@prisma/adapter-pg` provides more control:

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionPool: {
    min: 2,           // minimum idle connections
    max: 20,          // maximum total connections
    acquireTimeoutMillis: 10_000, // timeout waiting for connection
    timeoutMillis: 30_000,        // connection idle timeout
  }
});

const prisma = new PrismaClient({ adapter });
```

**Source**: [Prisma Connection Pool Documentation](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)

---

### 2. Optimal Pool Sizing Guidelines

From industry best practices:

#### Rule of Thumb
```
optimal_pool_size = (num_cores * 2) + effective_spindle_count
```

For web applications with database latency < 5ms:
```
pool_size ≈ CPU_cores * 4
```

For high-latency (>50ms) or long-running queries:
```
pool_size ≈ CPU_cores * 2
```

**Example**:
- 4-core server → pool size 16-20 for low latency, 8-10 for high latency
- Default Prisma on 4 cores: 9 connections (may be too small for high load)

#### Formula Based on Database Capacity

Total connections across all app instances should not exceed:
```
max_connections (PostgreSQL) - reserve_for_system (typically 3-5)
```

**Calculation**:
```
instance_pool_size = (max_connections - reserved) / expected_instances
```

**References**:
- [7 Node + Prisma Connection Pool Rules at Scale](https://medium.com/@1nick1patel1/7-node-prisma-connection-pool-rules-at-scale-f9054cdfaff7)
- [Prisma Production Guide](https://www.digitalapplied.com/blog/prisma-orm-production-guide-nextjs)

---

### 3. Connection Health Monitoring

#### Health Check Queries
```sql
-- Check database connectivity
SELECT 1;

-- Check pool status (pg_stat_activity)
SELECT
  state,
  count(*) as connections
FROM pg_stat_activity
WHERE datname = 'your_database'
GROUP BY state;
```

#### Leak Detection
Monitor for connections that stay open too long:
```sql
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds';
```

**Prisma Client** can emit events:
```typescript
prisma.$on('query', (e) => {
  console.log(`Query: ${e.query}, Duration: ${e.duration}ms`);
});

prisma.$on('error', (e) => {
  console.error('Prisma error:', e);
});
```

---

### 4. Redis Connection Pooling

While Redis is single-threaded and typically handles connections efficiently, connection pooling is still beneficial. Options:

#### a) ioredis Pool Configuration
```typescript
import { Redis } from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  // Connection pool settings:
  keepAlive: true,
  keepAliveDelay: 10000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  lazyConnect: true,
});
```

`ioredis` automatically manages a pool of connections. For high concurrency, increase `clusterRetryStrategy` and `maxRetriesPerRequest`.

#### b) Redis Connection Metrics
Monitor:
- Active connections
- Idle connections
- Connection wait time
- Failed connection attempts

**Source**: [ioredis documentation](https://github.com/luin/ioredis#pool-configuration-options)

---

### 5. Metrics to Instrument

Based on the existing metrics collection (`lib/create-comprehensive-metrics-dashboard-(grafana)/index.ts`), we should add:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `prisma_connection_pool_used` | Gauge | - | Currently active connections |
| `prisma_connection_pool_available` | Gauge | - | Available connections in pool |
| `prisma_connection_wait_time_seconds` | Histogram | operation | Time spent waiting for a connection |
| `prisma_connection_acquire_timeout_total` | Counter | - | Number of connection acquire timeouts |
| `redis_connections_active` | Gauge | - | Active Redis connections |
| `redis_connection_wait_time_seconds` | Histogram | command | Time waiting for Redis connection |

**Note**: The metrics file already defines `prisma_connection_pool_used` and `prisma_connection_pool_available` but they are not being updated. We need to implement the collection.

---

### 6. Implementation Strategy

#### Phase 1: Prisma Pool Optimization
- Configure `@prisma/adapter-pg` with custom pool parameters
- Make pool size configurable via environment variables
- Add pool metrics collection (hook into Prisma events)

#### Phase 2: Health Checks
- Implement `GET /health/database` endpoint
- Add connection leak detection (log warnings for long-running queries)
- Implement graceful degradation when pool exhausted

#### Phase 3: Redis Optimization
- Tune ioredis configuration for high concurrency
- Add Redis connection pool metrics (though ioredis manages internally)
- Implement connection health checks (PING)

#### Phase 4: Observability
- Ensure all pool metrics are scraped by Prometheus
- Create Grafana dashboard panels for pool health
- Set up alerts for:
  - Pool exhaustion (active connections ≈ max)
  - High wait times (> 100ms)
  - Connection acquire timeouts
  - Long-running queries (> 30s)

---

### 7. Existing Infrastructure

The project already has:
- ✅ `prisma.ts` singleton in `backend/src/lib/prisma.ts`
- ✅ Metrics infrastructure in `lib/create-comprehensive-metrics-dashboard-(grafana)/`
- ✅ Health check endpoint at `GET /health`
- ✅ Prometheus endpoint at `GET /metrics`

**Needs implementation**:
- Custom Prisma adapter with pool configuration
- Pool metrics collection (currently defined but not updated)
- Database connection health checks with query timing
- Configuration management (env vars for pool sizes, timeouts)

---

### 8. Environment Variables (Proposed)

```env
# Database Connection Pool
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20
DATABASE_POOL_ACQUIRE_TIMEOUT=10000
DATABASE_POOL_IDLE_TIMEOUT=30000

# Redis Connection
REDIS_MAX_RETRIES_PER_REQUEST=null
REDIS_KEEP_ALIVE=true
REDIS_KEEP_ALIVE_DELAY=10000
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
```

---

### 9. Testing Strategy

#### Unit Tests
- Mock PrismaClient and verify pool configuration
- Test metrics updates when connections are acquired/released
- Test timeout and error handling

#### Integration Tests
- Spin up test PostgreSQL container (e.g., via Testcontainers)
- Simulate high concurrency (e.g., 100 simultaneous requests)
- Verify pool sizing works as expected
- Check metrics reflect actual pool state

#### Load Tests
- Use artillery or k6 to generate query load
- Monitor connection wait times, pool exhaustion
- Verify graceful degradation under extreme load

---

### 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pool too small → request queuing | High | Start with conservative size, monitor and adjust |
| Pool too large → database overload | High | Calculate based on DB max_connections, leave headroom |
| Connection leaks | High | Implement leak detection, log warnings, max lifetime |
| Timeout misconfiguration | Medium | Follow defaults, test in staging, monitor |
| Migration from default pool | Medium | Ensure existing functions don't break, test thoroughly |

---

## Questions to Answer During Implementation

1. Should we implement a separate connection manager module, or extend the existing `prisma.ts`?
2. How to collect real-time pool metrics? Prisma doesn't expose internal pool stats directly. May need driver adapter.
3. Should we implement query timeout at the pool level or individual query level?
4. How to handle pool exhaustion gracefully? Queue? Reject? Circuit breaker?
5. What health check queries are most appropriate? Just `SELECT 1` or more comprehensive?
6. Should we implement connection warming (pre-warm pool on startup)?
7. How to handle Prisma migrations with custom adapter (any pitfalls)?

---

## Recommended Approach

Based on research, the best approach is:

### 1. Use `@prisma/adapter-pg` with Custom Pool
This gives full control over connection pool parameters and allows implementing health checks, metrics, and leak detection.

### 2. Implement Pool Monitoring via `pgbouncer` or Custom Wrapper
Since Prisma's query engine is a black box, we may need to:
- Query `pg_stat_activity` for actual connections seen by PostgreSQL
- Calculate pool metrics based on our own tracking (acquire/release hooks)
- Use Prisma's `$on('query')` event to track query duration

### 3. Make Configuration Environment-Specific
- **Development**: Smaller pool (2-4), aggressive timeouts
- **Staging**: Match production settings
- **Production**: Calculate based on DB tier (e.g., RDS instances have connection limits)

### 4. Add Health Check Endpoint
`GET /health/database` should return:
- Pool status (size, active, idle, available)
- Average query latency (from metrics)
- Last connection error (if any)

### 5. Instrumentation
Update `lib/create-comprehensive-metrics-dashboard-(grafana)/index.ts` to include:
- Connection wait time histogram
- Timeout counter
- Long-running query alerts

---

## Next Steps

1. ✅ Research completed - this document
2. ⏭ Create Git branch: `phase2-step9-connection-pool-optimization`
3. ⏭ Implement `src/lib/implement-connection-pool-optimization/index.ts`
4. ⏭ Add admin API routes `src/app/api/implement-connection-pool-optimization/route.ts`
5. ⏭ Write unit and integration tests
6. ⏭ Update metrics collection
7. ⏭ Test with load generation
8. ⏭ Verify all tests pass
9. ⏭ Update `phase2.json` with completion data
10. ⏭ Write report: `reports/phase2-step9-report.md`

---

## References

- [Prisma Connection Pool Documentation](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)
- [Prisma ORM Production Guide](https://www.digitalapplied.com/blog/prisma-orm-production-guide-nextjs)
- [7 Node + Prisma Connection Pool Rules at Scale](https://medium.com/@1nick1patel1/7-node-prisma-connection-pool-rules-at-scale-f9054cdfaff7)
- [PostgreSQL Connection Management](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [pgbouncer docs](https://www.pgbouncer.org/)

---

## Conclusion

Connection pool optimization is critical for reliability under load. The research indicates that using `@prisma/adapter-pg` with carefully tuned pool parameters is the recommended approach for production deployments. We'll implement a modular system that is configurable, observable, and resilient.
