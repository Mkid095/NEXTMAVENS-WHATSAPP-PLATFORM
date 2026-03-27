# Phase 1 Complete: Root Cause Investigation Summary

## Evidence Collected

### Backend Status
- Backend running on port 4930 (healthy)
- Nginx correctly proxies `/api/` to `127.0.0.1:4930` for whatsapp.nextmavens.cloud
- Login endpoint: `/api/v1/auth/login` → **200 OK**
- Auth/me endpoint: `/api/v1/auth/me` → **200 OK** with valid token
- WhatsApp instances endpoint: `/api/v1/whatsapp/instances` → **429 Quota Exceeded**
- Quota: org has 10/10 active_instances (limit reached)
- Route `/api/v1/whatsapp/instances` is **NOT REGISTERED** in server.ts

### Frontend Expected Calls
- `useInstances()` → GET `/whatsapp/instances` (relative to baseURL)
- VITE_API_URL = `/api/v1`
- With leading slash in API call path, actual request may be to `/whatsapp/instances` (root-relative), which returns 200 HTML (SPA), not JSON.

### Authentication Flow
- Login stores token → navigate('/')
- ProtectedRoute checks `localStorage.getItem('accessToken')` → redirects if missing
- API interceptor clears tokens and redirects only on **401** status
- 429 responses do NOT trigger redirect

### The Paradox
- User reports redirect loop (401) → token cleared
- But all tested endpoints with the token return **200 or 429**, not 401
- This suggests either:
  1. A different endpoint is returning 401
  2. The token is not being sent for some requests (due to baseURL/path issue)
  3. The token is being stripped or modified in transit
  4. There's a timing/race condition with localStorage

## Confirmed Problems (Must Fix)

1. **Missing endpoint**: Frontend expects `/api/v1/whatsapp/instances` but no route registered in backend
   - Should create: `backend/src/app/api/whatsapp-instances/route.ts`
   - Endpoints needed: GET /api/v1/whatsapp/instances (list), POST (create), GET/:id, PUT/:id, DELETE/:id, etc.

2. **Quota exceeded**: Org has 10/10 active_instances. Even after implementing route, calls will fail with 429 until quota reset/increase.

3. **Potential baseURL mismatch**:
   - Frontend uses `api.get('/whatsapp/instances')` with leading slash
   - With `VITE_API_URL="/api/v1"`, axios may drop the baseURL path, causing requests to `/whatsapp/instances` instead of `/api/v1/whatsapp/instances`.
   - This would hit SPA route (200 HTML) or Nginx location `/` → not API.
   - Need to either remove leading slash or use `api.get('whatsapp/instances')`.

4. **Nginx configuration complexity**: Multiple server blocks and location blocks exist; while the primary domain seems correct, there may be conflicts.

## Next Steps (Phase 2 & 3)

### Immediate Fixes (Address Confirmed Issues)

#### Fix 1: Correct API Base URL Usage in Frontend
**File**: All API calls in `src/hooks/useWhatsApp.ts` and other files.
**Change**: Remove leading slash from relative paths when using axios with baseURL.
```typescript
// Before:
api.get('/whatsapp/instances');
// After:
api.get('whatsapp/instances');
```
Apply to all instances: `/whatsapp/instances`, `/whatsapp/instances/${id}`, `/whatsapp/instances/${id}/connect`, etc.
Also fix: `/auth/me` → `auth/me`, `/auth/profile` → `auth/profile`, etc.

Alternatively, change `VITE_API_URL` to include trailing slash or adjust axios config.

#### Fix 2: Implement Missing WhatsApp Instances API
**File**: `backend/src/app/api/whatsapp-instances/route.ts` (new)
**Register in**: `backend/src/server.ts` after messages routes
**Logic**: Query Prisma for instances where `orgId = currentOrgId` from orgGuard context.
Return `{ success: true, data: { instances: [...] } }`.

#### Fix 3: Reset Org Quota
Run SQL to reset quota for `org_test_001` or increase limit:
```sql
UPDATE quota_usages
SET current = 0
WHERE org_id = 'org_test_001' AND metric = 'ACTIVE_INSTANCES';
```
Or via admin API if available.

### Then Re-test
After these fixes, the `/whatsapp/instances` call should succeed (200) with proper data.

If the **401 redirect loop still occurs**, we must capture exact network traffic:

#### Diagnostic: Add API Logging
Add to `src/lib/api.ts`:
```ts
// In response interceptor error handler, before 401 check:
console.error('[API Error]', error.response?.status, error.config?.url, error.response?.data);
```
Ensure all errors are logged with status.

#### Diagnostic: Capture Backend Logs
Have user provide backend logs from the time of login attempt (showing preHandler pipeline for the failing request).

## Current State

**Before proceeding, we need to confirm the actual endpoint being called and its response.** The user should:
1. Open browser DevTools → Network tab
2. Clear log, preserve log
3. Attempt login
4. Copy all requests with status codes, especially any 401/403/429
5. Provide screenshot or HAR file

Without this, we cannot definitively identify which endpoint returns 401.

## Hypothesis

**Leading hypothesis**: The combination of leading slash in API calls and `VITE_API_URL="/api/v1"` causes the browser to send requests to root-relative paths (e.g., `/whatsapp/instances`), which do not hit the backend API (no proxy, returns SPA HTML or 404). Some of these requests may trigger the API interceptor incorrectly due to CORS or other errors, leading to 401-like behavior. However, the interceptor only acts on 401, so this is unlikely.

**Secondary hypothesis**: The `/api/v1/whatsapp/instances` endpoint returns 429, and TanStack Query's retry logic might be causing additional requests that eventually hit a different endpoint (like `/auth/me`) after token expiration? Not plausible with 15-minute token.

**Third hypothesis**: There is an additional auto-called endpoint (like `/auth/me`) that returns 401 because the token's `orgId` in payload doesn't match any Member record (but we verified membership exists). Or maybe the user's `isActive` changed? No.

**Most likely actual cause of redirect**: The token is not being stored correctly due to a subtle bug in the login flow (e.g., localStorage quota exceeded, or storage cleared by another tab). Check `localStorage.length` after login. Or there is a page reload that clears state.

But we cannot confirm without direct observation.

## Action Plan

1. **Fix baseURL issue** (remove leading slashes) – this is a bug regardless
2. **Implement missing API route** – required for functionality
3. **Reset quota** – required for API to work
4. **Add diagnostic logging** and request user to collect network logs
5. **If 401 persists**, analyze logs to identify the exact failing endpoint, then trace authMiddleware for that endpoint.
