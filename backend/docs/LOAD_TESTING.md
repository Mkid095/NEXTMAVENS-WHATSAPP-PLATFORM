# Load Testing Guide

This document outlines load testing strategies and provides example scripts for validating the performance and scalability of the NEXTMAVENS WhatsApp Platform backend.

---

## Overview

Load testing helps ensure the system can handle expected and peak traffic while maintaining response time SLAs (Service Level Objectives).

**Target Metrics**:

| Metric | Target | Measurement |
|--------|--------|-------------|
| API latency (p95) | < 100ms | Excluding external Evolution API calls |
| Health check latency | < 50ms | |
| Rate limiting overhead | < 5ms | Additional latency from rate limit checks |
| Concurrent connections | 1000+ | Simultaneous client requests |
| Queue processing rate | >100 msg/sec | BullMQ message processing |
| Database query time (p99) | < 200ms | Simple queries (auth, org checks) |

---

## Tools

Recommended: **k6** (https://k6.io/) – modern, scriptable, cloud or local.

### Install k6

```bash
# macOS
brew install k6

# Ubuntu
sudo apt-get install k6

# Docker (alternative)
docker run -t -i --rm loadimpact/k6 run /scripts/test.js
```

Alternative: **Artillery** (Node.js-based) – good if prefer JavaScript.

---

## Test Scenarios

### 1. Baseline Health Check

**Goal**: Verify basic service availability under light load.

```javascript
// tests/01_health_check.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // ramp up to 10 VUs
    { duration: '1m', target: 10 },    // hold at 10
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<50'],  // 95% of requests < 50ms
  },
};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'health returns 200': (r) => r.status === 200,
    'status ok': (r) => r.json('status') === 'ok',
  });
  sleep(1);
}
```

Run:
```bash
k6 run tests/01_health_check.js
```

---

### 2. Authenticated API Requests

**Goal**: Test authenticated endpoints with valid JWT.

```javascript
// tests/02_authenticated_requests.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { generateToken } from './utils.js';  // helper to create test JWT

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Pre-generate token for all VUs (assumes test user exists)
const token = generateToken({
  userId: 'test_user_123',
  email: 'test@example.com',
  role: 'AGENT',
  orgId: 'org_test_123',
});

const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
};

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 }, // ramp to 100 concurrent
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'], // 95th percentile < 100ms
  },
};

export default function () {
  // Test rate limiting status endpoint (no side effects)
  const url = `${BASE_URL}/admin/rate-limiting/status/test_identifier`;
  const res = http.get(url, { headers });

  check(res, {
    'status 200': (r) => r.status === 200,
    'has allowed field': (r) => r.json().allowed !== undefined,
  });

  sleep(0.5);
}
```

Helper `utils.js` (simplified – use real JWT secret in test):

```javascript
import jwt from 'jsonwebtoken';

export function generateToken(payload) {
  return jwt.sign(payload, 'test-secret', { expiresIn: '1h' });
}
```

**Note**: For k6, you cannot import Node.js modules directly. Use the `k6/experimental/webcrypto` for JWT or pre-generate tokens and read from file. Simpler: skip auth for this scenario or use API key auth if available.

Alternative: Use **basic auth** just to test authenticated path without full JWT complexity.

---

### 3. Rate Limiting Endurance

**Goal**: Verify rate limiter blocks excess traffic and doesn't degrade performance.

```javascript
// tests/03_rate_limiting.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Use a fixed identifier to hit the same bucket
const identifier = 'rate_test_user_1';
const url = `${BASE_URL}/admin/rate-limiting/status/${identifier}`;
const headers = { 'Authorization': `Bearer dummy` };

export const options = {
  stages: [
    { duration: '2m', target: 200 }, // high load
  ],
  thresholds: {
    http_req_duration: ['p(95)<50'],
    http_req_failed: ['rate<0.1'],  // <0.1% errors
  },
  noConnectionReuse: false, // reuse connections
};

export default function () {
  const res = http.get(url, { headers });
  // Expect some 429s after limit exceeded
  check(res, {
    'status is 200 or 429': (r) => [200, 429].includes(r.status),
  });
  sleep(0.1);
}
```

This will eventually trigger 429 Too Many Requests. Verify that the system returns proper `Retry-After` header.

---

### 4. Webhook Ingestion (High Volume)

**Goal**: Simulate Evolution API webhook burst (e.g., 1000 messages arriving within 1 minute).

```javascript
// tests/04_webhook_ingestion.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const INSTANCE = 'test_instance';
const EVENT = 'messages.upsert';

// Generate random message payloads
function generateWebhookPayload(i) {
  return {
    event: EVENT,
    destination: `${INSTANCE}@s.whatsapp.net`,
    data: {
      key: {
        remoteJid: `1234567890${i}@s.whatsapp.net`,
        fromMe: false,
        id: `ABCDEF${i}`,
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: {
        type: 'text',
        text: { body: `Test message ${i}` },
      },
    },
  };
}

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // 50 VUs
    { duration: '1m', target: 100 },   // ramp to 100
    { duration: '2m', target: 100 },   // hold
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // webhooks may take longer
  },
};

const url = `${BASE_URL}/api/webhooks/evolution/${INSTANCE}/${EVENT}`;
const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': 'test-api-key', // Adjust to your webhook auth
};

export default function () {
  const payload = generateWebhookPayload(Math.floor(Math.random() * 10000));
  const res = http.post(url, JSON.stringify(payload), { headers });
  check(res, {
    'webhook accepted (200)': (r) => r.status === 200,
  });
  sleep(0.1);
}
```

**Note**: Webhook signature verification not implemented in this example. Add HMAC header if needed.

---

### 5. Queue Processing Validation

After running webhook load test, verify BullMQ queues are being processed:

```bash
# Connect to Redis
redis-cli

# List all BullMQ queues
KEYS *bull*
# Example output: bull:queue:high, bull:queue:normal, bull:queue:low

# Check queue lengths
LLEN bull:queue:high
LLEN bull:queue:normal
LLEN bull:queue:low

# Check completed/failed counts
HGET bull:queue:high:cm:data processed
HGET bull:queue:high:cm:data failed
```

If queues are draining (processed increasing, lengths decreasing), workers are keeping up.

---

### 6. Database Connection Pool Exhaustion

**Goal**: Ensure app doesn't exhaust DB connections under load.

**Monitoring**:

```sql
-- Connect to PostgreSQL and monitor
SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'whatsapp_platform';
-- Should be well below max_connections (default 100)

-- Check for long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds';
```

If you see many idle connections or long-running queries, consider:
- Increasing `max_connections` (and adjust Prisma connection pool size)
- Reducing connection pool size in Prisma (`connection_limit` in datasource)
- Optimizing slow queries with `EXPLAIN ANALYZE`

---

### 7. Socket.IO Connection Scaling (Optional)

To test WebSocket connections, use a dedicated tool like **autobahn-testsuite** or a custom Node.js script with `socket.io-client`.

Example sketch:

```javascript
// tests/07_websocket.js (run with node, not k6)
const { io } = require('socket.io-client');
const NUM_CLIENTS = 100;

const sockets = [];
for (let i = 0; i < NUM_CLIENTS; i++) {
  const socket = io('http://localhost:3000', {
    auth: { token: 'jwt-token-here' },
  });
  socket.on('connect', () => {
    console.log(`Client ${i} connected`);
  });
  sockets.push(socket);
}

// Keep alive for 5 minutes
setTimeout(() => {
  sockets.forEach(s => s.disconnect());
  console.log('Disconnected all');
}, 5 * 60 * 1000);
```

---

## Performance Tuning Tips

1. **Increase Node.js event loop**:
   ```bash
   # Set max listeners (default 10, increase for many sockets)
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

2. **Prisma connection pool**:
   ```prisma
   // schema.prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     pool_size = 20  // Default 5, increase for higher concurrency
   }
   ```

3. **Redis max clients**:
   ```redis
   # redis.conf
   maxclients 10000
   ```

4. **BullMQ concurrency**:
   ```typescript
   // In queue setup
   new Queue('webhooks', {
     connection: { host: '127.0.0.1', port: 6379 },
     defaultJobOptions: { attempts: 3, backoff: { type: 'exponential' } },
   });
   // Worker concurrency
   worker.run(concurrency: 10);  // adjust based on CPU
   ```

---

## CI/CD Integration

Add load testing to your CI pipeline (GitHub Actions example):

```yaml
name: Load Test

on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0'  # weekly

jobs:
  load-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - name: Install Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run DB migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
      - name: Start server
        run: npm start &
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-secret
      - name: Wait for server
        run: sleep 5 && curl http://localhost:3000/health
      - name: Run k6 load test
        uses: grafana/k6-action@v0.3.0
        with:
          filename: tests/load/01_baseline.js
          env: BASE_URL=http://localhost:3000
```

---

## Acceptance Criteria

For a staging environment test run:

- ✅ 1000 concurrent users can hit health check with p95 < 50ms
- ✅ Rate limiting enforces limits without dropping >0.1% legitimate traffic
- ✅ No errors in server logs during load test (only expected 429s)
- ✅ BullMQ queue depth remains stable or decreases during sustained load
- ✅ Database CPU < 70%, memory < 80%
- ✅ Redis CPU < 50%, memory < 80%

---

**Next**: Schedule load test runs in staging before production launch. Document results and adjust configuration accordingly.

EOF
