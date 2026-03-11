# Phase 2 Step 2 Research: Build Real-time Messaging with Socket.io

**Date:** March 11, 2026
**Objective:** Implement real-time messaging with Socket.io for instant message/status updates to frontend clients
**Architecture Context:** Multi-tenant WhatsApp platform with PostgreSQL (RLS), Evolution API webhooks, Redis already available

---

## 1. Socket.io Core Architecture

### 1.1 Server Setup with Redis Adapter

**Why Redis Adapter?**
- Enables horizontal scaling across multiple Node.js instances
- Synchronizes room membership and broadcasting across servers
- Required for production deployments (>10K concurrent connections)

**Implementation Pattern** (from Socket.io docs):

```typescript
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

const pubClient = createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

export const io = new Server(httpServer, {
  adapter: createAdapter(pubClient, subClient),
  cors: { origin: process.env.CORS_ORIGIN, credentials: true }
});
```

**Key considerations:**
- Use Redis 7.0+ with sharded adapter (`createShardedAdapter`) for >100K connections
- Separate pub/sub clients (don't reuse same client)
- Handle connection failures gracefully (Redis down shouldn't crash app)

### 1.2 Authentication Middleware

**Challenge:** WebSocket connection establishes once and persists. Must authenticate on connection handshake.

**Best Practice:** JWT in `auth` property (from Socket.io docs):

```typescript
// Client
const socket = io({
  auth: { token: "eyJ..." }
});

// Server
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("unauthorized"));

  try {
    const payload = verifyJwt(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new Error("user not found");

    socket.data.userId = user.id;
    socket.data.orgId = user.orgId;
    next();
  } catch (err) {
    next(new Error("invalid token"));
  }
});
```

**Important:** Middleware runs only on initial handshake (not on reconnection). Socket.io automatically attempts reconnection; if JWT expires, need to handle `connect_error` on client and refresh token.

### 1.3 Multi-Tenancy: Namespaces vs Rooms

**Option A: Namespaces** (recommended for tenant isolation)

```typescript
// Dynamic namespace per org: /org-{orgId}
const orgNamespace = io.of(/^\/org-\w+$/);

orgNamespace.use((socket, next) => {
  const orgId = socket.nsp.name.split('-')[1];
  // Verify user belongs to org
  socket.data.orgId = orgId;
  next();
});

orgNamespace.on("connection", (socket) => {
  console.log(`Client connected to org ${socket.data.orgId}`);
});
```

**Option B: Rooms** (lighter, simpler)

```typescript
io.on("connection", (socket) => {
  socket.join(`org-${user.orgId}`); // Join org room
  socket.join(`instance-${instanceId}`); // Join instance room

  // Later broadcast:
  io.to(`org-${orgId}`).emit("message:new", data);
});
```

**Recommendation:** Use **rooms** for this use case. Why?
- Simpler: single namespace (`/`) with dynamic room assignment
- More flexible: clients can join multiple rooms (e.g., both org and specific instance)
- Namespaces create separate connection boundaries; rooms are sufficient for our isolation needs

**Isolation Strategy:**
- On connection: Join `org-{orgId}` room AND `instance-{instanceId}` room (based on user's permissions)
- When broadcasting: Use `io.to(room).emit()` to target specific tenant/instance
- Never broadcast globally (`io.emit()`) without org filtering

### 1.4 Event Design Patterns

**Server → Client Events** (backchannel):

```typescript
// From webhook processor (after DB write):
await prisma.$executeRaw`SELECT set_config('app.current_org', ${orgId}, false)`; // Already done
io.to(`instance-${instanceId}`).emit("whatsapp:message:upsert", {
  id, chatJid, messageId, status, from, to, body, timestamp
});

// Client listens:
socket.on("whatsapp:message:upsert", (data) => {
  queryClient.setQueryData(['messages', instanceId, chatJid], (old: any) =>
    [...old, data].sort((a,b) => a.timestamp - b.timestamp)
  );
});
```

**Event naming convention:** `domain:action:subtype` (e.g., `whatsapp:message:update`, `whatsapp:instance:status`)

**Client → Server Events** (optional, for acknowledgments):

```typescript
// Client confirms message received
socket.emit("message:ack", { messageId, receivedAt: Date.now() });

// Server:
socket.on("message:ack", async (data) => {
  await prisma.whatsappMessage.update({
    where: { id: data.messageId },
    data: { clientAckAt: new Date(data.receivedAt) }
  });
});
```

**Note:** For MVP, only need server→client push. Client→server via REST is fine.

### 1.5 Connection Lifecycle & Recovery

**Key features:**
- Automatic reconnection (Socket.io default: exponential backoff)
- Session recovery: Socket.io uses `sid` cookie to restore connection state (rooms, data)
- Middleware runs only on initial handshake (not reconnection)

**Handling JWT expiration:**
```typescript
// Middleware should allow reconnection even if token expired?
// Option 1: Use long-lived refresh tokens, only check validity initially
// Option 2: On `connect_error` with "unauthorized", force logout on client

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const payload = verifyJwt(token);
  if (payload.exp < Date.now() / 1000) {
    const err = new Error("token expired");
    err.data = { code: "TOKEN_EXPIRED" };
    return next(err);
  }
  next();
});
```

**State persistence:** Socket.io stores session info in memory. If server restarts, clients automatically reconnect and re-join rooms. But any transient in-memory state is lost (should be stateless anyway).

---

## 2. Security Considerations

### 2.1 Authentication & Authorization

- **Always** authenticate on connection handshake using JWT
- Validate user belongs to the org/instance they claim (DB lookup)
- Reject unauthorized connections with `401`/`403` errors
- Use HTTPS/WSS in production to prevent token interception

### 2.2 Room Access Control

- Never allow clients to join arbitrary rooms
- Server assigns rooms based on authenticated user's permissions
- Validate room membership before broadcasting to it

```typescript
socket.on("join:instance", async (instanceId) => {
  // Verify user has access to this instance
  const hasAccess = await checkUserInstanceAccess(socket.data.userId, instanceId);
  if (!hasAccess) {
    socket.emit("error", { message: "access denied" });
    return;
  }
  socket.join(`instance-${instanceId}`); // Allow
});
```

**Never trust client-provided room names.**

### 2.3 Rate Limiting & DoS Protection

Socket.io connections bypass typical HTTP rate limiting. Implement:

```typescript
// Track connections per IP/user
const connectionAttempts = new Map<string, number>();

io.use((socket, next) => {
  const ip = socket.handshake.address;
  const count = connectionAttempts.get(ip) || 0;
  if (count > 10) {
    return next(new Error("too many connections"));
  }
  connectionAttempts.set(ip, count + 1);
  next();
});

// On disconnect: decrement
socket.on("disconnect", () => {
  const ip = socket.handshake.address;
  connectionAttempts.set(ip, Math.max(0, (connectionAttempts.get(ip) || 0) - 1));
});
```

Also use:
- `@fastify/rate-limit` for HTTP handshake endpoints (Socket.io upgrade)
- Socket.io built-in `maxHttpBufferSize` to prevent large payload attacks

### 2.4 Input Validation

Validate all events received from clients:

```typescript
import { z } from "zod";

const sendMessageSchema = z.object({
  chatJid: z.string(),
  message: z.string().min(1).max(4096),
  type: z.enum(["text"]).optional()
});

socket.on("client:send:message", async (data) => {
  const result = sendMessageSchema.safeParse(data);
  if (!result.success) {
    socket.emit("error", { message: "invalid data" });
    return;
  }
  // Process...
});
```

### 2.5 Secure Redis Configuration

- If Redis is shared, use separate database index for Socket.io
- If multi-tenant Redis, namespace keys: `socket.io:org-{orgId}`
- Set Redis password in production
- Configure Redis to accept connections only from localhost/cluster

---

## 3. Testing Strategies

### 3.1 Unit Testing Socket.io Servers

**Challenge:** Socket.io server is not pure function; needs testing harness.

**Use `socket.io-client` to simulate clients:**

```typescript
import { Server } from "socket.io";
import { createServer } from "http";
import { Client } from "socket.io-client";

describe("Socket.io server", () => {
  let io: Server;
  let server: any;
  let clientSocket: Client;

  beforeEach(() => {
    server = createServer();
    io = new Server(server, { adapter: createMemoryAdapter() }); // In-memory adapter for tests
    setupSocketHandlers(io); // Your implementation
    server.listen();
  });

  afterEach(() => {
    server.close();
  });

  it("should broadcast new message to room", (done) => {
    // Connect client
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: validJwt({ orgId: "org-1" }) }
    });

    clientSocket.on("connect", async () => {
      // Join room (server auto-joins org room on connect)
      // Trigger server-side event
      io.to("instance-1").emit("whatsapp:message:upsert", mockMessage);
    });

    clientSocket.on("whatsapp:message:upsert", (data) => {
      expect(data.id).toBe("msg-1");
      done();
    });
  });
});
```

**Use `@socket.io/test-emitter`** for isolated event testing without network.

### 3.2 Integration Testing with Database

Test full flow: Webhook → DB → Socket.io broadcast → client receives.

```typescript
test("Webhook triggers real-time push", async () => {
  // 1. Connect a client with JWT for org-1
  const client = await connectClient(org1User);

  // 2. Send webhook request to our Fastify route
  await request
    .post("/api/webhooks/evolution")
    .set("X-Webhook-Signature", signature)
    .send(webhookPayload);

  // 3. Assert client received event
  const events = await client.collectEvents("whatsapp:message:upsert", 1);
  expect(events[0].instanceId).toBe("instance-1");
});
```

**Cleanup:** Ensure socket server and Redis test containers are torn down after tests.

### 3.3 Performance Testing

- Use `autocannon` or `artillery` to simulate 10K concurrent WebSocket connections
- Measure: connection time, message latency, memory usage
- Test Redis adapter with multiple server instances (cluster)

---

## 4. Implementation Plan

### Step 2.1: Core Socket.io Library

**File:** `src/lib/build-real-time-messaging-with-socket.io/index.ts`

Responsibilities:
- Initialize Socket.io server with Redis adapter
- JWT authentication middleware
- Room management (join/leave based on user permissions)
- Event registration (define all server→client events)

**Structure:**
```typescript
export class SocketService {
  private io: Server | null = null;

  async initialize(server: HttpServer, redisUrl: string, jwtSecret: string) {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.io = new Server(server, {
      adapter: createAdapter(pubClient, subClient),
      cors: { origin: process.env.CORS_ORIGIN, credentials: true }
    });

    this.setupMiddleware(jwtSecret);
    this.setupEventHandler();
  }

  private setupMiddleware(jwtSecret: string) {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      // verify JWT, load user, set socket.data
      next();
    });
  }

  private setupEventHandler() {
    this.io.on("connection", (socket) => {
      socket.on("join:instance", (instanceId) => {
        // Validate access, then socket.join(`instance-${instanceId}`)
      });
      socket.on("disconnect", () => {});
    });
  }

  broadcastToInstance(instanceId: string, event: string, data: any) {
    this.io?.to(`instance-${instanceId}`).emit(event, data);
  }

  broadcastToOrg(orgId: string, event: string, data: any) {
    this.io?.to(`org-${orgId}`).emit(event, data);
  }
}
```

**Size limit:** ~200 lines. Keep focused on core service.

### Step 2.2: Route/API Integration (Optional)

**Actually not needed.** Socket.io runs as middleware on HTTP server, not as separate route.

Instead: modify `src/server.ts` to initialize Socket.io:

```typescript
import { createServer } from "http";
import { SocketService } from "@/lib/build-real-time-messaging-with-socket.io";

const server = createServer(app); // Fastify/Express
const socketService = new SocketService();
await socketService.initialize(server, process.env.REDIS_URL!, process.env.JWT_SECRET!);
```

No separate route file needed. Socket.io endpoint is `ws://domain/socket.io/`.

### Step 2.3: Webhook → Socket Integration

**Modify** `src/lib/integrate-evolution-api-message-status-webhooks/handlers.ts`:

```typescript
import { socketService } from "@/lib/build-real-time-messaging-with-socket.io";

export async function handleMessageUpsert(data: MessageUpsertData, orgId: string) {
  const message = await upsertMessage(data, orgId);
  const instanceId = message.instanceId;

  // Push real-time to connected clients
  socketService.broadcastToInstance(instanceId, "whatsapp:message:upsert", {
    id: message.id,
    chatId: message.chatId,
    messageId: message.messageId,
    status: message.status,
    from: message.from,
    body: message.body,
    timestamp: message.timestamp
  });
}
```

**Dependency direction:** Webhook processor imports socket service (no circular). Socket service is singleton initialized at startup.

### Step 2.4: Frontend Socket Client

**File:** `src/lib/socket-client.ts`

```typescript
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectSocket() {
  if (socket?.connected) return socket;

  socket = io({
    path: "/socket.io",
    auth: { token: getAccessToken() } // From localStorage/auth context
  });

  socket.on("connect_error", (err) => {
    if (err.data?.code === "TOKEN_EXPIRED") {
      // Trigger re-login
    }
  });

  // Listen for events
  socket.on("whatsapp:message:upsert", (data) => {
    // Invalidate React Query cache
    queryClient.setQueryData(['messages', instanceId, data.chatId], ...)
  });

  return socket;
}
```

**React hook:** `src/hooks/useSocket.ts` - manages connection, auto-reconnect, cleanup.

**Integration:** Update chat pages to use socket for real-time updates instead of (or alongside) polling.

### Step 2.5: Testing

**Unit tests:** `src/test/socket.service.test.ts`
- Test authentication acceptance/rejection
- Test room joining logic
- Test broadcast methods

**Integration tests:** `src/test/socket.integration.test.ts`
- Connect client, trigger webhook, assert event received
- Test RLS: client from org-A should not receive org-B messages
- Test multiple instances in same org (cross-pollution)

**Coverage target:** >90% for socket service.

---

## 5. Testing & Validation Checklist

- [ ] All unit tests pass (`npm run test:unit`)
- [ ] Integration tests pass (`npm run test:integration`)
- [ ] RLS tests still pass (no regression)
- [ ] No TypeScript errors
- [ ] ESLint clean (or minimal)
- [ ] Manual test: connect frontend, send messages, verify real-time updates
- [ ] Manual test: disconnect/reconnect, verify room rejoin
- [ ] Manual test: multiple orgs, ensure isolation
- [ ] Load test: 1000 concurrent connections (local simulation)

---

## 6. Potential Pitfalls & Mitigations

| Pitfall | Mitigation |
|---------|------------|
| Socket.io connection limit (Node.js default ~1000) | Increase `--max-http-header-size`, use clustering (`pm2` with `instances: "max"`) |
| Redis memory pressure | Set TTL on socket adapter keys (default is no TTL - monitor usage) |
| State leakage between tests (rooms persist) | Clear `io.of("/").sockets` and Redis test DB between suites |
| Client reconnection floods after server restart | Implement exponential backoff (Socket.io default is good) |
| JWT expiration disconnects client | Use refresh tokens; handle `connect_error` to re-auth |
| Socket.io server incompatible with load balancer | Configure load balancer for WebSocket (sticky sessions NOT needed with Redis adapter) |
| Memory leaks (event listeners not removed) | Always `socket.off()` in disconnect handler |

---

## 7. Questions Answered from Research

**Q: Do I need to handle Socket.io scaling from day 1?**
A: Yes, use Redis adapter even in dev/test. It's a config change, not architectural shift. Without Redis, clustering won't work.

**Q: Should I use namespaces or rooms?**
A: Rooms. Namespaces create separate connection endpoints; rooms are lighter and sufficient for tenant isolation.

**Q: How to test Socket.io with RLS?**
A: Each test must set RLS context before queries. Use existing test helpers: `setOrgContext(orgId)`.

**Q: Can Socket.io and REST co-exist?**
A: Absolutely. For a chat app: Use REST for historical messages, CRUD operations. Use WebSocket for real-time push.

**Q: What about message ordering?**
A: Evolution webhooks may arrive out of order. Socket.io delivers events in order per connection, but across multiple servers Clock skew possible. Use `timestamp` from Evolution event (serverTime) to sort.

**Q: How to handle offline clients?**
A: Socket.io disconnects when client goes offline. They'll receive messages via REST polling on reconnect (existing behavior). No need for offline queue push.

---

## 8. References

- Socket.io Redis Adapter: https://socket.io/docs/v4/redis-adapter/
- Socket.io Middleware: https://socket.io/docs/v4/middlewares/
- Socket.io Rooms: https://socket.io/docs/v4/rooms/
- Socket.io Namespaces: https://socket.io/docs/v4/namespaces/
- Socket.io Authentication with JWT: https://socket.io/how-to/use-with-jwt
- Scaling to 100K+ connections: https://medium.com/@connect.hashblock/scaling-socket-io-redis-adapters-and-namespace-partitioning-for-100k-connections-afd01c6938e7
- Socket.io testing guide: https://socket.io/docs/v4/testing/

---

**Next:** Proceed with implementation following modular architecture (max 250 lines/file), no emojis, primary colors only, comprehensive tests, and ensure RLS compliance.
