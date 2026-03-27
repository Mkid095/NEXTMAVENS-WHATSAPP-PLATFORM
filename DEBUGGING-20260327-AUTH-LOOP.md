# Authentication Loop Investigation - Phase 1 Evidence

## Date: 2026-03-27

## Problem Statement
User logs in successfully (200 OK with token) but is immediately redirected back to login page, creating an infinite loop.

## Evidence Gathered

### 1. Backend Configuration Issues

**Port Mismatch (CRITICAL INFRASTRUCTURE BUG):**
- Backend .env specifies: `PORT=4930`
- Backend is actually listening on: `0.0.0.0:4930` (confirmed via `ss -tlnp`)
- Nginx config proxies `/api/` to: `http://127.0.0.1:3002`
- Nothing is listening on port 3002
- **Result**: Nginx cannot reach the backend! Should cause 502/504 errors, not 401.

**Question**: How is curl working? Need to verify if curl is going directly to backend port or through Nginx.

### 2. Route Registration Analysis

**From `backend/src/server.ts`:**
- Auth routes registered: `/api/v1/auth/*` (login, refresh, logout, me) ✓
- Chat pagination: `/api/chats` ✓
- Instance heartbeat: `/api/instances/:id/heartbeat` ✓ (public endpoint)
- Messages routes: `/api/v1/messages/*` ✓
- **MISSING**: `/api/v1/whatsapp/instances` endpoint - NOT REGISTERED

**Frontend Expectation (`useWhatsApp.ts:61`):**
```typescript
queryFn: async () => {
  const { data } = await api.get('/whatsapp/instances');
  return (data.instances || []) as WhatsAppInstance[];
}
```
Calls: `GET /api/v1/whatsapp/instances`

**Conclusion**: The endpoint the frontend needs does NOT exist in the backend.

### 3. Quota Middleware Behavior

**From `backend/src/middleware/quota.ts`:**
- Quota check runs in global preHandler BEFORE route matching
- For paths containing `/instances` or `/whatsapp` (non-admin), metric = `ACTIVE_INSTANCES`
- If quota exceeded (10/10), returns **429 Too Many Requests** with Retry-After header
- **Does NOT clear tokens or redirect** - just returns 429

**Test Results:**
```bash
# Login works:
curl -s -X POST https://whatsapp.nextmavens.cloud/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"revccnt@gmail.com","password":"Elishiba@95"}'
# → 200 OK, returns valid JWT token

# Instances endpoint:
TOKEN=<login_token>
curl -s -H "Authorization: Bearer $TOKEN" \
  https://whatsapp.nextmavens.cloud/api/v1/whatsapp/instances -w "HTTP Status: %{http_code}\n"
# → HTTP Status: 429 (quota exceeded)
```

### 4. Frontend Error Handling

**From `src/lib/api.ts`:**
- Response interceptor only handles **401 Unauthorized**
- On 401: clears localStorage tokens and redirects to `/login`
- **Does NOT handle 429** (quota) separately - 429 will bubble up to the query error state

**From `src/App.tsx`:**
- `ProtectedRoute` checks `localStorage.getItem('accessToken')`
- If no token present → redirects to login
- Token is being stored according to login flow

### 5. The Paradox

**Observed:**
- curl shows **429** for `/api/v1/whatsapp/instances`
- User reports **401** causing redirect loop

**Possible Explanations:**
1. **Different endpoint returns 401** - maybe `/auth/me` or another auto-called endpoint
   - Tested `/auth/me`: returns **200 OK** ✓
2. **Nginx proxy issue**: Backend unreachable on port 3002 might cause Nginx to return 502/504, but some config could transform to 401?
3. **Timing issue**: Token might not be stored before navigation
   - Login.tsx stores token THEN navigates ✓ (correct)
4. **Multiple endpoints called**: Something else also calls an endpoint that returns 401
5. **LocalStorage sync issue**: Token stored but not readable immediately?

### 6. Missing Route Consequences

Since `/api/v1/whatsapp/instances` is NOT registered:
- Request goes through preHandler pipeline (auth, orgGuard, quota, etc.)
- After all middleware, Fastify tries to find a route handler
- No route matches → **404 Not Found** (from `app.setNotFoundHandler`)
- But we're seeing 429, so quota middleware IS blocking before 404

**Flow:**
```
Request → preHandler
  → authMiddleware (validates JWT) ✓
  → orgGuard (sets org context) ✓
  → 2FA (if needed) ✓
  → rateLimit ✓
  → quotaCheck → hits ACTIVE_INSTANCES quota → 429 (response sent, done)
  → (no route handler needed, quota returns early)
```

## Root Cause Analysis (In Progress)

**Primary Suspects:**

1. **Missing `/api/v1/whatsapp/instances` route** - The frontend expects this endpoint but it doesn't exist
   - This is a DEFINITE problem that needs fixing
   - But 429 ≠ 401, so this alone doesn't explain the redirect loop

2. **Nginx ↔ Backend port mismatch** - Nginx proxies to port 3002, backend runs on 4930
   - This is a CRITICAL infrastructure misconfiguration
   - Could cause various error codes depending on what's listening on 3002 (if anything)
   - Need to check what actually answers on port 3002

3. **Another endpoint returning 401** - Something else is being called that returns 401
   - Could be another query hook running automatically
   - Could be a WebSocket connection attempt
   - Could be a static asset request being incorrectly routed

## Next Investigation Steps

### Immediate Actions:

1. **Check what's on port 3002:**
   ```bash
   sudo ss -tlnp | grep :3002
   sudo lsof -i :3002
   ```
   If nothing, Nginx is proxy-ing to a dead endpoint.

2. **Test backend directly (byassing Nginx):**
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:4930/api/v1/whatsapp/instances -w "\n%{http_code}\n"
   ```
   Compare response through Nginx vs direct.

3. **Check all TanStack Query hooks that auto-run:**
   - App component renders ProtectedRoute + Dashboard
   - Dashboard calls `useInstances()` on mount
   - Are there other queries running? `useCurrentUser` might be defined but is it used?

4. **Add browser console logging to capture ALL requests:**
   User needs to open DevTools → Network tab → preserve log → try login → capture exact requests/responses

5. **Check nginx error logs:**
   ```bash
   sudo tail -100 /var/log/nginx/error.log | grep -A5 -B5 "3002\|upstream\|connect() failed"
   ```

6. **Verify route registration completeness:**
   Check if there should be a `/api/v1/whatsapp/instances` route and why it's missing.

## Working Hypotheses

**Hypothesis A:** Nginx port mismatch means some requests succeed (static files, maybe other routes) but API requests fail with 502, which might be handled differently than expected.

**Hypothesis B:** The frontend makes MULTIPLE requests on Dashboard mount:
- `GET /auth/me` (maybe from a header component or something) → returns 200 ✓
- `GET /api/v1/whatsapp/instances` → returns 429 (quota)
- But TanStack Query retries or another query returns 401 from some OTHER endpoint

**Hypothesis C:** The 401 is coming from the WebSocket connection attempt or a polling endpoint.

**Hypothesis D:** Token format/structure issue: JWT payload has `orgId`, but maybe orgGuard fails for this user? Need to check orgGuard logic.

## What We Need to Know

To proceed, we need EVIDENCE of:
- Exact request URL and response status for EVERY request made after login
- Which specific endpoint returns 401 (if any)
- Whether Nginx is even reaching the backend on /api/ routes
- Complete backend logs showing the request pipeline for the failing request

## Action Items (Pending Phase 2)

Once root cause is identified:
- Fix port mismatch (change Nginx to :4930 or backend to :3002)
- Implement missing `/api/v1/whatsapp/instances` GET endpoint
- Reset org's active_instances quota (currently 10/10)
- Verify org membership and orgGuard logic
