# Deployment Guide

**NEXTMAVENS WhatsApp Platform - Backend**

This guide covers deploying the backend service to development, staging, and production environments.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Development Setup](#development-setup)
4. [Docker Deployment (Recommended)](#docker-deployment-recommended)
5. [Manual Deployment](#manual-deployment)
6. [Database Migrations](#database-migrations)
7. [Health Checks](#health-checks)
8. [Troubleshooting](#troubleshooting)
9. [Production Hardening](#production-hardening)

---

## Prerequisites

- **Node.js**: 18.x or higher (20.x recommended)
- **PostgreSQL**: 14.x or higher
- **Redis**: 7.x or higher
- **Git**: for cloning repository
- **Docker & Docker Compose** (recommended for staging/production)

---

## Environment Configuration

Create a `.env` file in the `backend/` directory with the following variables:

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/whatsapp_platform"
# For production, ensure SSL mode: "postgresql://...?sslmode=require"

# Authentication
JWT_SECRET="your-256-bit-secret-change-this-in-production"
# Generate with: openssl rand -base64 32

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=3000
NODE_ENV=production | development | test
LOG_LEVEL=info | debug | warn | error

# CORS (adjust to your frontend domain)
CORS_ORIGIN="https://your-frontend-domain.com"

# Optional: Rate limiting defaults (if not using admin API to configure)
# RATE_LIMIT_MAX_REQUESTS=100
# RATE_LIMIT_WINDOW_MS=60000
```

**Critical**: Never commit the `.env` file to version control. Use environment-specific secrets management in production (e.g., Docker secrets, Kubernetes secrets, environment variable injection from CI/CD).

---

## Development Setup

### 1. Install Dependencies

```bash
cd backend
npm ci
```

### 2. Generate Prisma Client

```bash
npm run prisma:generate
```

### 3. Set Up Database

Create a PostgreSQL database (local or Docker):

```bash
# Using Docker
docker run --name postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=whatsapp_platform \
  -p 5432:5432 \
  -d postgres:15-alpine

# Run migrations
npm run prisma:migrate
```

### 4. Seed Sample Data (Optional)

```bash
npm run db:seed
```

### 5. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` with hot reload.

---

## Docker Deployment (Recommended)

### Using Docker Compose (All-in-One)

The repository includes a `docker-compose.yml` that orchestrates the app, PostgreSQL, and Redis.

#### docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: wa_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-whatsapp_platform}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: wa_redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: wa_backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-whatsapp_platform}?connect_timeout=1000
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      CORS_ORIGIN: ${CORS_ORIGIN:-*}
      NODE_ENV: production
      PORT: 3000
    ports:
      - "3000:3000"
    volumes:
      - ./logs:/app/logs
    command: >
      sh -c "
        npx prisma migrate deploy &&
        npm start
      "
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  postgres_data:
  redis_data:
```

#### Build and Run

```bash
# Create .env file with JWT_SECRET etc.
echo "JWT_SECRET=$(openssl rand -base64 32)" > backend/.env

# Build and start
cd backend
docker compose up -d --build

# View logs
docker compose logs -f app

# Stop
docker compose down
```

### Dockerfile

```Dockerfile
# ----------------
# Builder stage
# ----------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# ----------------
# Runtime stage
# ----------------
FROM node:20-alpine

WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy application source
COPY src ./src
COPY prisma ./prisma

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if(r.statusCode!==200)throw new Error(r.statusCode)})"

# Start server
CMD ["node", "dist/server.js"]
```

Build manually:

```bash
cd backend
docker build -t nextmavens-wa-backend:latest .
docker run -p 3000:3000 --env-file .env nextmavens-wa-backend:latest
```

---

## Manual Deployment

### 1. Install System Dependencies

#### Ubuntu/Debian

```bash
sudo apt update
sudo apt install -y nodejs npm postgresql redis-server
```

### 2. Clone and Install

```bash
git clone <your-repo>
cd NEXTMAVENS-WHATSAPP-PLATFORM/backend
npm ci --only=production
npx prisma generate
```

### 3. Configure Database

```bash
sudo -u postgres createdb whatsapp_platform
# Or use psql to create DB and user
```

Apply migrations:

```bash
npx prisma migrate deploy
```

### 4. Start Service with PM2 (Production Process Manager)

```bash
# Build for production
npm run build

# Start with PM2
pm2 start dist/server.js --name "wa-backend"

# Save PM2 config
pm2 save
pm2 startup  # generate startup script
```

### 5. Configure Nginx Reverse Proxy (Optional but Recommended)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable SSL with Let's Encrypt:

```bash
sudo certbot --nginx -d api.yourdomain.com
```

---

## Database Migrations

### Development

Create new migration:

```bash
npx prisma migrate dev --name descriptive_migration_name
```

Apply pending migrations:

```bash
npx prisma migrate deploy
```

### Production

**Never use `prisma migrate dev` in production.** Always use `prisma migrate deploy` which is designed for production:

```bash
cd backend
npm ci --only=production
npx prisma generate
npx prisma migrate deploy
```

This applies any pending migrations in a transaction-safe manner.

### Rollback

If a migration fails or causes issues, rollback one step:

```bash
npx prisma migrate resolve --rolled-back <migration_name>
```

Then re-deploy with a corrected migration.

**Important**: Always test migrations on a staging database first!

---

## Health Checks

The service exposes `GET /health` which returns:

```json
{
  "status": "ok",
  "timestamp": "2025-03-14T10:30:00.000Z",
  "uptime": 3600,
  "database": true,
  "redis": true,
  "memory": { ... }
}
```

Use this endpoint for:

- Load balancer health probes (AWS ALB, GCP LB, etc.)
- Kubernetes liveness/readiness probes
- Monitoring systems (Grafana, Datadog)

---

## Troubleshooting

### Issue: "Environment variable not found: DATABASE_URL"

**Cause**: `.env` file not loaded or DATABASE_URL missing.

**Fix**:
```bash
# Verify .env exists in backend directory
ls -la .env
# Ensure DATABASE_URL is set correctly
echo $DATABASE_URL
# If using Docker, pass via environment or env_file
```

### Issue: "Redis connection error"

**Cause**: Redis not running or `REDIS_URL` misconfigured.

**Fix**:
```bash
# Check Redis is running
redis-cli ping  # Should return PONG
# Verify REDIS_URL in .env matches Redis endpoint
```

### Issue: 2FA Lockout (No Access to Admin)

**Cause**: Privileged user without 2FA enabled blocked by enforcement middleware.

**Immediate Recovery**:

1. Connect to database directly:
   ```sql
   UPDATE "User" SET "mfaEnabled" = false, "mfaSecret" = NULL WHERE id = 'user-id';
   ```

2. Or use the API with a valid 2FA token to disable if still accessible.

**Prevention**: Always enable 2FA immediately after creating privileged user accounts.

### Issue: Rate Limits Too Aggressive

**Cause**: Default limits may be too low for your workload.

**Fix**:
- Use admin API: `PUT /admin/rate-limiting/rules` to create custom rules
- Or modify environment variables if defaults are set

### Issue: Messages Not Being Delivered (Queue Stuck)

**Check**:
1. BullMQ dashboard: Visit Redis and inspect queues (`redis-cli keys '*'`)
2. Check DLQ: `GET /admin/dlq` for failed webhooks
3. Verify Evolution API credentials and instance connectivity
4. Check logs for errors: `docker compose logs -f app` or `pm2 logs`

### Issue: RLS Policy Violation Errors

**Cause**: `orgGuard` middleware not executed or `currentOrgId` not set.

**Fix**:
- Ensure route is not bypassing global preHandler pipeline
- Verify orgGuard is registered in `server.ts` before any protected routes
- Check that JWT payload includes `orgId`

### Issue: TypeScript Compilation Errors

**Cause**: Dependencies out of sync or outdated type definitions.

**Fix**:
```bash
rm -rf node_modules package-lock.json
npm ci
npx prisma generate
npm run lint
```

---

## Production Hardening

### 1. Secrets Management

- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault)
- Rotate `JWT_SECRET` periodically (requires re-issuing all tokens)
- Rotate database passwords and Redis passwords monthly

### 2. Database

- Enable **PostgreSQL SSL** (use `sslmode=require` in DATABASE_URL)
- Set up **automated backups** (daily full + WAL archiving)
- Enable **connection pooling** (PgBouncer) for high traffic
- Configure **monitoring** (pg_stat_statements, slow query log)

### 3. Redis

- Set a **Redis password** (`redis://:password@host:6379`)
- Configure **persistence** (AOF + RDB)
- Set **maxmemory** policy (e.g., `volatile-lru`)
- Enable **TLS** for in-transit encryption (Redis 6+)

### 4. SSL/TLS

- Terminate SSL at load balancer (Nginx, HAProxy) or use application-level TLS
- Use certificates from Let's Encrypt or commercial CA
- Redirect all HTTP to HTTPS
- Enable HSTS header (already provided by `@fastify/helmet`)

### 5. Monitoring & Alerting

- **Metrics**: Export Prometheus metrics (consider adding `fastify-metrics` plugin)
- **Logging**: Structured JSON logs (already configured via Fastify logger)
- **Alerting**: Set up alerts for:
  - 5xx error rate > 1%
  - Health check failures
  - High memory usage (>80%)
  - Queue depth > 10,000
  - DLW size > 1,000

### 6. Backup & Restore

#### PostgreSQL Backup

```bash
# Daily backup script
pg_dump -h localhost -U postgres whatsapp_platform > backup_$(date +%Y%m%d).sql

# Restore
psql -h localhost -U postgres whatsapp_platform < backup_20250314.sql
```

#### Redis Backup

Redis automatically creates RDB snapshots (configured in `redis.conf`). Copy `dump.rdb` for backup.

---

## Scaling Considerations

- **Horizontal scaling**: Run multiple app instances behind a load balancer.
  - Ensure all instances connect to the same Redis and PostgreSQL.
  - Use Redis adapter for Socket.IO to share WebSocket state.
- **Database**: Read replicas for reporting queries; partitioning for large tables (AuditLog, Messages).
- **Redis**: Use Redis Cluster for high availability and sharding.
- **BullMQ**: Multiple workers can process queues in parallel; ensure workers are stateless.

---

## Security Checklist

- [x] JWT secret is strong and stored securely
- [x] HTTPS enforced (via reverse proxy)
- [x] Rate limiting enabled
- [x] 2FA required for admin users
- [x] RLS enabled on all tenant tables
- [x] CORS restricted to known origins
- [x] Helmet security headers enabled
- [x] Secrets not logged (verify logger config)
- [ ] Database encrypted at rest (recommend enabling PostgreSQL TDE)
- [ ] Redis encrypted at rest (use encryption at host level)
- [ ] Regular vulnerability scanning (npm audit, Snyk)
- [ ] Penetration testing performed

---

## Support

For deployment issues:

1. Check logs: `docker compose logs app` or `pm2 logs wa-backend`
2. Verify health endpoint: `curl http://localhost:3000/health`
3. Consult troubleshooting section above
4. Open an issue in the repository with:
   - Environment details (OS, Node version, DB version)
   - Error logs (sensitive data redacted)
   - Steps to reproduce

---

**Last Updated**: 2026-03-14

EOF
