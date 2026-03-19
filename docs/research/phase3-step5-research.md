# Phase 3 Step 5 Research: Implement Usage-Based Billing & Overage

## Executive Summary

This research focuses on implementing usage-based billing (also called consumption-based billing) with overage handling in a Stripe-integrated SaaS platform. The goal is to bill customers based on actual usage rather than fixed subscription fees, with automatic charges for usage beyond included quotas.

## Key Concepts

### What is Usage-Based Billing?
Usage-based billing (UBB) charges customers based on their actual consumption of a product or service, rather than a flat monthly fee. Examples include:
- API calls (per 1,000 requests)
- Data transfer (per GB)
- Compute resources (per CPU hour)
- Messages sent (per WhatsApp message)
- Tokens processed (per AI token)

### Overage
Overage refers to usage beyond the included quota in a subscription. For example, a plan might include 10,000 API calls per month, with additional calls billed at $0.50 per 1,000 calls.

## Stripe's Modern Approach: Billing Meters

Stripe has evolved its usage-based billing API. The legacy "usage records" API is deprecated as of 2025-03-31. The modern approach uses **Billing Meters** and **Meter Events**.

### Core Concepts

1. **Billing Meter**: Configuration in Stripe that defines how usage is aggregated and billed
   - **Event name**: Identifier used when reporting usage (e.g., "api_requests")
   - **Aggregation type**:
     - `sum` - Total all values (for quantities like GB, tokens, minutes)
     - `count` - Count number of events (for per-event billing)
   - **Value settings**: Unit amount, currency, and how to calculate charges

2. **Meter Event**: Data sent to Stripe to record usage
   ```javascript
   stripe.billingMeterEvents.create({
     event_name: "api_requests",
     customer: "cus_123",
     value: 1500, // quantity used
     timestamp: new Date(),
   });
   ```

3. **Meter Usage Analytics**: API to query usage data for dashboards and reporting
   ```javascript
   const analytics = stripe.billingMeterUsageAnalytics.query({
     meter: "meter_123",
     customer: "cus_123",
     time_range: { start: ..., end: ... },
   });
   ```

### Implementation Flow

```
1. Create a product in Stripe
2. Create a price with `usage_type: "metered"`
3. Create a billing meter linked to the price
4. During customer usage:
   - Record meter events (real-time or batched)
   - Optionally store in local DB for caching/analytics
5. At billing period end:
   - Stripe aggregates usage from meter events
   - invoices automatically include usage charges
   - Overage is calculated based on plan tier
```

### Important Notes
- Meter events can be sent in real-time or in batches
- Stripe allows some event timestamp flexibility (backdating up to 7 days)
- Usage is aggregated per billing period (subscription cycle)
- There is a limit on meter events per minute per meter (rate limits apply)

## Technical Architecture

### Database Schema

```sql
-- Track cumulative usage counters (for quick lookup)
CREATE TABLE organization_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  meter_name TEXT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  usage_value NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, meter_name, period_start, period_end)
);

-- Store raw usage events (for audit/reconciliation)
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  meter_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  stripe_meter_event_id TEXT,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB
);

-- Subscription usage quotas (plan definitions)
CREATE TABLE plan_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL,
  meter_name TEXT NOT NULL,
  included_units NUMERIC NOT NULL DEFAULT 0,
  overage_rate_cents NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(plan_id, meter_name)
);
```

### Architecture Pattern

```
┌─────────────┐
│   Client    │ sends usage event
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Fastify Route       │ POST /api/usage/events
│ - Auth middleware   │ - Validate input
│ - OrgGuard          │ - Check quota limits
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Usage Service       │ Core logic
│ - Record event      │ - Update counters
│ - Send to Stripe    │ - Enforce limits
│ - Check overage     │ - Emit metrics
└──────┬──────────────┘
       │
       ├──────────────┬─────────────┐
       ▼              ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Postgres│  │  Redis  │  │ Stripe  │
   │ (usage) │  │ (cache) │  │  Meter  │
   └─────────┘  └─────────┘  └─────────┘
```

### Key Implementation Details

1. **Real-time vs Batched Recording**
   - **Real-time**: Send each event to Stripe immediately (simpler, more API calls)
   - **Batch**: Accumulate locally, send periodically (reduces Stripe API calls, better for high volume)
   - Recommendation: Use BullMQ queue for reliable batch processing

2. **Quota Enforcement**
   - Check current usage + incoming event against quota before recording
   - Allow soft limit (warning) or hard limit (block)
   - Overage can be:
     - Block additional usage
     - Allow with automatic charges (per overage rate)
     - Require manual approval

3. **Multi-tenancy**
   - All usage must be scoped by `org_id`
   - Ensure org isolation in queries
   - Use Row Level Security (RLS) in PostgreSQL

4. **Observability**
   - Prometheus metrics:
     - `usage_events_total` (counter by org, meter)
     - `usage_overage_charges_cents` (counter)
     - `usage_quota_remaining` (gauge)
   - Logging with structured JSON for analysis

5. **Error Handling**
   - Stripe API failures: retry with exponential backoff
   - Database failures: transactional consistency
   - Duplicate events: idempotency keys to prevent double-counting

### Security Considerations

1. **Authentication**: All usage endpoints require authenticated user with valid org
2. **Authorization**: User must belong to the org they're reporting usage for
3. **Rate Limiting**: Prevent abuse via excessive usage event submissions
4. **Input Validation**:
   - Value must be numeric and positive
   - Meter name must be from allowed list (whitelist)
   - Timestamp must be recent (prevent backdating abuse)
5. **RLS**: Enable PostgreSQL RLS on usage tables with `org_id` policies

### Testing Strategy

1. **Unit Tests**
   - Usage service methods
   - Quota calculation logic
   - Overages detection
   - Stripe API mocking

2. **Integration Tests**
   - End-to-end usage event recording
   - Quota enforcement
   - Database state verification
   - Webhook handling (if applicable)

3. **Mocking Stripe**
   - Use `stripe-mock` or custom jest mock for Stripe API
   - Simulate meter event creation responses
   - Test error scenarios (rate limits, invalid meter)

### OpenAPI Documentation

```yaml
/usage/events:
  post:
    summary: Record usage event
    security:
      - bearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - meter
              - value
            properties:
              meter:
                type: string
                description: Meter name (e.g., "api_requests", "messages_sent")
              value:
                type: number
                description: Quantity used
              timestamp:
                type: string
                format: date-time
                description: When usage occurred (defaults to now)
    responses:
      201:
        description: Usage recorded
      400:
        description: Invalid input or quota exceeded
      401:
        description: Unauthorized
      403:
        description: Forbidden (org mismatch)
```

## Implementation Plan

### Step 1: Core Library (`src/lib/implement-usage-based-billing-&-overage/`)
- `index.ts`: Main exports (recordUsage, getUsage, getOverage)
- `usage-service.ts`: Core business logic
- `stripe-client.ts`: Stripe API wrapper with retry logic
- `quota-calculator.ts`: Quota and overage calculation
- `types.ts`: TypeScript interfaces

### Step 2: API Routes (`src/app/api/implement-usage-based-billing-&-overage/`)
- `route.ts`: POST /api/usage/events (record usage)
- GET /api/usage/current (get current period usage)
- GET /api/usage/analytics (query historical usage)
- (Optional) webhook endpoint for Stripe events

### Step 3: Testing & Validation
- Unit tests for service layer
- Integration tests for API endpoints
- Full test suite pass (`npm run test:all`)
- TypeScript compilation (`npm run lint`)

## Relevant Stripe Documentation

- [Usage-based billing overview](https://docs.stripe.com/billing/subscriptions/usage-based)
- [Recording usage with Meter Events](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api)
- [Billing Meters API reference](https://docs.stripe.com/api/billing/meter)
- [Meter Events API reference](https://docs.stripe.com/api/billing/meter-event)
- [Usage analytics](https://docs.stripe.com/billing/subscriptions/usage-based/analytics)
- [Migration from legacy usage records](https://docs.stripe.com/billing/subscriptions/usage-based-legacy/migration-guide)

## Decisions To Make

1. **Real-time vs Batch**: Should we send usage to Stripe immediately or queue for batch processing?
   - Real-time: Simpler, but more Stripe API calls, no retry queue
   - Batch: More complex (need BullMQ worker), but reliable and cost-effective

2. **Quota enforcement point**:
   - At API gateway (fastify route)
   - In service layer
   - In database constraint

3. **Caching strategy**:
   - Redis for current period usage counters (fast quota checks)
   - PostgreSQL as source of truth

4. **Webhooks needed?**: For real-time notifications of Stripe billing events (invoice.payment_succeeded, etc.)

5. **Granularity of usage records**: Store every event vs aggregated rollups?

## Estimated Complexity

- **Simple implementation**: Record events directly to Stripe, minimal caching (3-4 hours)
- **Production-ready**: With queue, caching, retries, metrics, thorough testing (7-8 hours)

## Recommended Stack

- **Stripe SDK**: `stripe` npm package (already in dependencies from previous steps)
- **Queue**: BullMQ (already in project for workflow engine)
- **Cache**: Redis (already in project)
- **Metrics**: Prometheus client (already in project)
- **Validation**: Zod (already in project)
- **Storage**: Prisma with PostgreSQL (existing)

## Next Steps

1. Finalize architectural decisions with team
2. Create git branch: `phase3-step-5-implement-usage-based-billing-overage`
3. Implement core library with TDD
4. Implement API routes with Zod validation
5. Write integration tests
6. Update OpenAPI spec
7. Run full test suite
8. Write step 5 report
9. Update phase3.json
10. Create PR and merge
