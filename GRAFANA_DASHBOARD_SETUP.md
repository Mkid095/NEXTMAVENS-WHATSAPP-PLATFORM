# Grafana Dashboard Configuration

This document provides instructions for setting up the Grafana dashboard for the NEXTMAVENS WhatsApp Platform.

## Available Metrics

All metrics are exposed at `GET /metrics` (Prometheus text format) on the application port (default: 9403).

### HTTP Metrics
- `whatsapp_platform_http_requests_total` (counter) - Total HTTP requests
  - Labels: `method`, `route`, `status_code`, `org_id`
- `whatsapp_platform_http_request_duration_seconds` (histogram) - Request latency
  - Labels: `method`, `route`, `status_code`
- `whatsapp_platform_http_active_connections` (gauge) - Current active HTTP connections
- `whatsapp_platform_http_errors_total` (counter) - 5xx errors
  - Labels: `error_type`, `route`

### Message Queue Metrics (BullMQ)
- `whatsapp_platform_queue_jobs_total` (counter) - Total jobs added to queue
  - Labels: `message_type`, `priority`
- `whatsapp_platform_queue_jobs_active` (gauge) - Currently processing jobs
- `whatsapp_platform_queue_jobs_completed_total` (counter) - Successfully completed jobs
  - Labels: `message_type`
- `whatsapp_platform_queue_jobs_failed_total` (counter) - Failed jobs sent to DLQ
  - Labels: `failure_type`
- `whatsapp_platform_queue_jobs_retry_total` (counter) - Retry attempts made
  - Labels: `message_type`
- `whatsapp_platform_queue_dlq_size` (gauge) - Current dead letter queue size
- `whatsapp_platform_queue_workers_active` (gauge) - Active worker processes
- `whatsapp_platform_queue_processing_duration_seconds` (histogram) - Job processing time
  - Labels: `message_type`

### Instance Heartbeat Metrics
- `whatsapp_platform_instance_heartbeat_total` (counter) - Heartbeats received
  - Labels: `status` (online/offline)
- `whatsapp_platform_instance_currently_online` (gauge) - Number of instances currently online
- `whatsapp_platform_instance_heartbeat_age_seconds` (gauge) - Age of last heartbeat per instance
  - Labels: `instance_id`, `organisation_id`
- `whatsapp_platform_instance_background_sync_duration_seconds` (histogram) - Background sync duration
  - Buckets: [0.1, 0.5, 1, 2.5, 5, 10]

### Node.js Default Metrics (prom-client)
- `whatsapp_platform_nodejs_process_cpu_seconds_total` (counter)
- `whatsapp_platform_nodejs_process_heap_*` (various)
- `whatsapp_platform_nodejs_eventloop_*` (various)
- `whatsapp_platform_nodejs_process_uptime` (gauge)
- `whatsapp_platform_nodejs_process_memory_usage_*` (gauge)

## Prometheus Configuration

Add the following job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'whatsapp-platform'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:9403']  # Adjust host/port as needed
```

## Grafana Dashboard Panels

### 1. HTTP Requests Overview
- **Title**: HTTP Request Rate
- **Query**: `rate(whatsapp_platform_http_requests_total[5m])`
- **Type**: Time series (stat or graph)
- **Description**: Requests per second by status code

- **Title**: HTTP Request Duration (p95)
- **Query**: `histogram_quantile(0.95, sum(rate(whatsapp_platform_http_request_duration_seconds_bucket[5m])) by (le, route))`
- **Type**: Time series
- **Description**: 95th percentile latency per route

- **Title**: HTTP Errors Rate
- **Query**: `rate(whatsapp_platform_http_errors_total[5m])`
- **Type**: Time series
- **Description**: 5xx errors per second

### 2. Queue Performance
- **Title**: Queue Size
- **Query**: `whatsapp_platform_queue_jobs_active + whatsapp_platform_queue_jobs_total - whatsapp_platform_queue_jobs_completed_total - whatsapp_platform_queue_jobs_failed_total`
- **Type**: Stat or gauge
- **Description**: Current jobs waiting/processing

- **Title**: Jobs Completed vs Failed
- **Query**: `rate(whatsapp_platform_queue_jobs_completed_total[5m])` vs `rate(whatsapp_platform_queue_jobs_failed_total[5m])`
- **Type**: Time series (multiple series)
- **Description**: Job completion rate

- **Title**: DLQ Size
- **Query**: `whatsapp_platform_queue_dlq_size`
- **Type**: Stat/gauge
- **Description**: Dead letter queue size (alerts if > 10)

- **Title**: Job Processing Duration (p99)
- **Query**: `histogram_quantile(0.99, sum(rate(whatsapp_platform_queue_processing_duration_seconds_bucket[5m])) by (le, message_type))`
- **Type**: Time series
- **Description**: Job latency by message type

### 3. Instance Health
- **Title**: Online Instances
- **Query**: `whatsapp_platform_instance_currently_online`
- **Type**: Stat/gauge
- **Description**: Number of WhatsApp instances currently online

- **Title**: Heartbeat Age (oldest)
- **Query**: `max(whatsapp_platform_instance_heartbeat_age_seconds) by (instance_id)`
- **Type**: Time series or stat
- **Description**: Seconds since last heartbeat per instance (alerts if > 60s)

- **Title**: Heartbeat Rate
- **Query**: `rate(whatsapp_platform_instance_heartbeat_total[5m])`
- **Type**: Time series
- **Description**: Heartbeats per second

### 4. System Resources (Node.js)
- **Title**: CPU Usage
- **Query**: `rate(whatsapp_platform_nodejs_process_cpu_seconds_total[5m])`
- **Type**: Time series
- **Description**: CPU time per second (cores)

- **Title**: Memory Usage
- **Query**: `whatsapp_platform_nodejs_process_memory_usage_heap_used_bytes / 1024 / 1024`
- **Type**: Stat/gauge
- **Description**: Heap memory used (MB)

- **Title**: Event Loop Lag
- **Query**: `whatsapp_platform_nodejs_eventloop_lag_seconds * 1000`
- **Type**: Time series
- **Description**: Event loop delay in milliseconds

### 5. Alerting Rules (Alertmanager)

Create alerts in Prometheus/Alertmanager:

```yaml
groups:
  - name: whatsapp-platform-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(whatsapp_platform_http_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High HTTP error rate detected"

      - alert: QueueBacklog
        expr: whatsapp_platform_queue_jobs_active / (whatsapp_platform_queue_workers_active + 1) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Queue backlog increasing"

      - alert: InstanceOffline
        expr: whatsapp_platform_instance_currently_online < 1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "All WhatsApp instances offline"

      - alert: DLQSize
        expr: whatsapp_platform_queue_dlq_size > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Dead letter queue growing"

      - alert: HighMemoryUsage
        expr: whatsapp_platform_nodejs_process_memory_usage_heap_used_bytes / whatsapp_platform_nodejs_process_memory_usage_heap_total_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Memory usage above 85%"
```

## Dashboard Import JSON

A complete Grafana dashboard JSON can be created using the panel specifications above. Export from Grafana after building.

## Notes

- The `/metrics` endpoint is public and does not require authentication (standard for Prometheus).
- Metrics are automatically collected on server startup via `setupMetrics()` in `server.ts`.
- Queue instrumentation requires the BullMQ worker/queue to be active to generate data.
- Instance heartbeat metrics require active instances sending heartbeats to `/api/instances/:instanceId/heartbeat`.
- The Redis "IMPORTANT! Eviction policy" warning indicates Redis should be configured with `maxmemory-policy noeviction` in `redis.conf` to prevent data loss during memory pressure.

## Configuration Reference

- **Default port**: 9403 (configurable via `PORT` env var)
- **Metrics endpoint**: `http://localhost:9403/metrics`
- **Health check**: `http://localhost:9403/health`
- **Ping**: `http://localhost:9403/ping`
