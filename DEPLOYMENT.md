# Production Deployment Guide

## ✅ Current Status

| Component | Status | Details |
|-----------|--------|---------|
| Backend API | 🟢 Healthy | `localhost:4930` → Docker container |
| Frontend SPA | 🟢 Serving | `localhost:6429` → Nginx container |
| PostgreSQL | 🟢 Healthy | `localhost:5433` |
| Redis | 🟢 Healthy | `localhost:6379` |
| Evolution API | 🟢 Connected | `http://evolution-api:8080` (Docker network) |
| Nginx Proxy | 🟢 Configured | Rate limiting + logging enabled |
| SSL/TLS | ⚠️ Not yet | See "HTTPS Setup" below |
| Domain DNS | ⚠️ Not yet | Point to server IP |

---

## 📋 Completed Fixes

1. **✅ EVOLUTION_API_KEY** – Set from `.env` (value: `B6D711FCDE4D4FD5936544120E713976`)
2. **✅ Groups API Bug** – Fixed column name mismatch (`createdAt` quoted correctly)
3. **✅ Evolution Healthcheck** – Fixed by using Node instead of curl
4. **✅ Evolution Hostname** – Corrected to `evolution-api` (Docker service name)
5. **✅ Port Binding** – Frontend on `127.0.0.1:6429` (host nginx will proxy)
6. **✅ Rate Limiting** – Added to nginx: `10 r/s with burst 20`
7. **✅ Logging** – Nginx access/error logs enabled
8. **✅ Environment Security** – `.env*` gitignored; secrets via Docker .env

---

## 🔒 HTTPS Setup (REQUIRED)

Choose **Option A** (recommended) or **Option B**.

### Option A: Use Host Nginx as SSL Terminator (Keeps Docker as-is)

**Prerequisites**:
- Domain `whatsapp.nextmavens.cloud` points to server IP (`72.61.89.110`)
- Host nginx installed (`sudo apt-get install nginx` if missing)

**Steps**:

1. **Copy proxy config**:
   ```bash
   sudo cp infrastructure/nginx/host-proxy.conf /etc/nginx/sites-available/whatsapp.nextmavens.cloud
   sudo ln -s /etc/nginx/sites-available/whatsapp.nextmavens.cloud /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default 2>/dev/null || true
   ```

2. **Obtain SSL certificate** (Certbot):
   ```bash
   sudo apt-get update
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d whatsapp.nextmavens.cloud
   ```
   Certbot will automatically configure SSL and redirect HTTP→HTTPS.

3. **Test and reload**:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Verify**:
   - HTTPS: `https://whatsapp.nextmavens.cloud` loads
   - HTTP redirects to HTTPS

---

### Option B: Move SSL to Docker Nginx (Stops Host Nginx)

**Use this if you want all-in-Docker and can free port 80/443**.

1. **Stop host nginx**:
   ```bash
   sudo systemctl stop nginx
   sudo systemctl disable nginx
   ```

2. **Update `docker-compose.yml`** to publish ports:
   ```yaml
   whatsapp-frontend:
     ports:
       - "80:80"
       - "443:443"
     volumes:
       - ./certs:/etc/nginx/certs:ro  # Mount SSL certs
   ```

3. **Update `nginx-frontend.conf`** to include SSL listen and certificate paths:
   ```nginx
   server {
       listen 443 ssl http2;
       server_name whatsapp.nextmavens.cloud;
       ssl_certificate /etc/nginx/certs/fullchain.pem;
       ssl_certificate_key /etc/nginx/certs/privkey.pem;
       # ... rest of config ...
   }
   # Also keep HTTP→HTTPS redirect server block
   ```

4. **Obtain certificates** (use certbot in standalone mode since host nginx stopped):
   ```bash
   sudo certbot certonly --standalone -d whatsapp.nextmavens.cloud
   sudo cp /etc/letsencrypt/live/whatsapp.nextmavens.cloud/*.pem ./certs/
   ```

5. **Restart Docker services**:
   ```bash
   docker compose up -d whatsapp-frontend
   ```

---

## 🔐 Security Checklist

- [x] `.env` gitignored
- [x] Strong secrets in `.env` (JWT, PostgreSQL password, Evolution secrets)
- [x] Rate limiting on API endpoints
- [x] HTTPS pending (see above)
- [ ] Optional: Add `fail2ban` for brute-force protection on login
- [ ] Optional: Set up audit logging (backend logs → filebeat → ELK)

---

## 🌐 Access URLs

**Local (development)**:
- Frontend: http://localhost:6429
- Backend API: http://localhost:4930
- Evolution API: http://localhost:3001
- PostgreSQL: localhost:5433
- Redis: localhost:6379

**Production (after DNS + SSL)**:
- HTTPS: `https://whatsapp.nextmavens.cloud`
- Backend (direct): `https://whatsapp.nextmavens.cloud/api/v1/`
- Webhooks (public): `https://whatsapp.nextmavens.cloud/webhooks/whatsapp`

---

## 🚀 Quick Start Commands

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f whatsapp-backend
docker compose logs -f whatsapp-frontend

# Restart a service
docker compose restart whatsapp-backend

# Exec into backend
docker compose exec whatsapp-backend sh
```

---

## 🔧 Common Issues

| Issue | Solution |
|-------|----------|
| `Connection refused` to backend | Ensure `whatsapp-backend` container is healthy (`docker compose ps`) |
| 504 Gateway Timeout | Check nginx proxy config; ensure `whatsapp-backend` reachable on Docker network |
| Groups API error `column g.created_at does not exist` | Fixed; rebuild backend if still seeing error: `docker compose build whatsapp-backend && docker compose up -d whatsapp-backend` |
| Evolution connection fails | Verify `EVOLUTION_API_KEY` set and `EVOLUTION_API_URL=http://evolution-api:8080` |
| Port 80 already in use | Use Option A (host nginx proxy) or stop existing nginx service |

---

## 📈 Monitoring & Ops

- **Backend metrics**: `GET /metrics` (Prometheus format) on port 4930
- **Health checks**: `/health` on backend and frontend
- **Docker logs**: `docker compose logs -f <service>`
- **Resource usage**: `docker stats`

---

## 🧪 Test Login

```
Email: revccnt@gmail.com
Password: Elishiba@95
```

---

## 🔄 Next Steps

1. **Set up HTTPS** (see above)
2. **Configure DNS**: Add A record for `whatsapp.nextmavens.cloud` → `72.61.89.110`
3. **Create Evolution instances** manually via Evolution admin UI or API, then link in our platform
4. **Set up monitoring** (Grafana + Prometheus already integrated in backend)
5. **Optional**: Refactor `useInstances.ts` further if needed

---

## 📞 Support

For issues, check logs first:
```bash
docker compose logs whatsapp-backend
docker compose logs whatsapp-frontend
docker logs nextmavens-whatsapp-evolution
```
