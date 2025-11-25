# 🚀 DEPLOYMENT GUIDE - Caly v3

**Date:** November 25, 2025  
**Status:** Ready for immediate deployment  

---

## QUICK START (5 minutes)

### Option 1: Railway Deployment (Recommended)

```powershell
# 1. Install Railway CLI (if not already done)
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Navigate to Backend
cd Backend

# 4. Link to Railway project
railway link
# Select your Caly project

# 5. Deploy
railway up

# 6. Verify
$env:RAILWAY_TOKEN | railway status
```

### Option 2: Local Testing First

```powershell
# 1. Install dependencies
cd Backend
npm install

# 2. Set environment variables
$env:DATABASE_URL = "postgresql://user:password@localhost:5432/caly_db"
$env:JWT_SECRET = "your-secret-key-here"
$env:NODE_ENV = "development"
$env:PORT = 8080

# 3. Run database migrations
npm run migrate

# 4. Start server
npm start

# 5. Test in browser
Start-Process "http://localhost:8080/health"
Start-Process "http://localhost:8080/api/docs"
```

---

## FULL DEPLOYMENT CHECKLIST

### Pre-Deployment (5 minutes)

- [ ] All code committed to Git
- [ ] Environment variables documented
- [ ] Database connection tested locally
- [ ] Docker image built (if using Docker)
- [ ] SSL certificate ready (for HTTPS)

### Environment Setup

#### Railway Dashboard
1. Go to https://railway.app
2. Open your Caly project
3. Click "Settings"
4. Add Environment Variables:

```
DATABASE_URL=postgresql://user:password@host/database
JWT_SECRET=your-super-secret-key-here
API_URL=https://api.caly.ai
EXOTEL_SID=your-exotel-sid
EXOTEL_TOKEN=your-exotel-token
SHOPIFY_API_KEY=your-shopify-key
SHOPIFY_API_SECRET=your-shopify-secret
WASABI_ACCESS_KEY=your-wasabi-key
WASABI_SECRET_KEY=your-wasabi-secret
NODE_ENV=production
PORT=8080
LOG_LEVEL=info
```

#### Local .env File (Development Only)

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/caly_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=caly_db
DB_USER=postgres
DB_PASSWORD=password

# Authentication
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRY=24h
REFRESH_TOKEN_EXPIRY=7d

# Server
NODE_ENV=development
PORT=8080
HOST=0.0.0.0
API_URL=http://localhost:8080

# Exotel
EXOTEL_SID=your-exotel-sid
EXOTEL_TOKEN=your-exotel-token
EXOTEL_BASE_URL=https://api.exotel.com/v2

# Shopify
SHOPIFY_API_KEY=your-shopify-key
SHOPIFY_API_SECRET=your-shopify-secret
SHOPIFY_API_VERSION=2024-01

# Wasabi (S3-compatible storage)
WASABI_ENDPOINT=https://s3.wasabisys.com
WASABI_REGION=us-east-1
WASABI_BUCKET=caly-recordings
WASABI_ACCESS_KEY=your-wasabi-key
WASABI_SECRET_KEY=your-wasabi-secret

# Twilio (TTS)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token

# Logging
LOG_LEVEL=debug
LOG_FILE=logs/caly.log

# Redis (optional, for sessions)
REDIS_URL=redis://localhost:6379

# Monitoring
SENTRY_DSN=your-sentry-dsn (Phase 6)
DATADOG_API_KEY=your-datadog-key (Phase 6)
```

---

## STEP-BY-STEP DEPLOYMENT

### Step 1: Database Setup

```powershell
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE caly_db;

# Create user
CREATE USER caly_user WITH PASSWORD 'secure_password_here';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE caly_db TO caly_user;

# Exit
\q
```

### Step 2: Run Migrations

```powershell
cd Backend

# Run all migrations
npm run migrate
# This executes:
# - 001_add_onboarding_fields.sql
# - 002-add-recording-url.sql
# - 003-phase4-indexes.sql
```

### Step 3: Verify Database Schema

```powershell
# Connect to database
psql -U caly_user -d caly_db

# Check tables
\dt

# Check columns on calls table
\d calls

# Check indexes
\di
```

**Expected tables:**
- clients (company accounts)
- users (client employees)
- calls (call records)
- actions (call actions/notes)
- audit_logs (compliance logging)
- recordings (call recordings)

### Step 4: Test Backend Locally

```powershell
# Install dependencies
npm install

# Set environment variables
$env:DATABASE_URL = "postgresql://caly_user:password@localhost:5432/caly_db"
$env:JWT_SECRET = "test-secret-key"
$env:NODE_ENV = "development"

# Start server
npm start

# Expected output:
# ✓ Database connection successful
# ✓ Active clients: 0
# 🚀 Caly server running on 0.0.0.0:8080
```

### Step 5: Test API Endpoints

```powershell
# Health check
curl http://localhost:8080/health
# Expected: {"status": "ok", "timestamp": "...", "service": "caly-voice-agent"}

# Swagger docs
Start-Process "http://localhost:8080/api/docs"

# Register test account
$body = @{
    email = "test@example.com"
    password = "Test123!"
    companyName = "Test Company"
} | ConvertTo-Json

$response = Invoke-WebRequest `
  -Uri "http://localhost:8080/api/auth/register" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"

$response.Content | ConvertFrom-Json
```

### Step 6: Build Frontend

```powershell
# Navigate to Frontend
cd Frontend

# Install dependencies
npm install

# Set environment variables
$env:REACT_APP_API_URL = "http://localhost:8080"
$env:REACT_APP_ENV = "development"
$env:REACT_APP_DEBUG = "true"

# Build production bundle
npm run build

# Start development server (for testing)
npm start
```

### Step 7: Deploy to Staging (Railway)

```powershell
# Ensure you're in Backend directory
cd Backend

# Initialize Railway project (if first time)
railway init

# Link to your Railway project
railway link

# Set environment variables in Railway
railway variable add DATABASE_URL "postgresql://..."
railway variable add JWT_SECRET "your-secret-here"
railway variable add NODE_ENV "staging"
railway variable add API_URL "https://staging-caly.railway.app"

# Deploy
railway up
# This will:
# 1. Build the Docker image
# 2. Push to Railway registry
# 3. Deploy to staging environment
# 4. Run health checks
```

### Step 8: Verify Staging Deployment

```powershell
# Get staging URL
railway open

# Test health endpoint
curl https://staging-caly.railway.app/health

# Test Swagger docs
Start-Process "https://staging-caly.railway.app/api/docs"

# Test API registration
$body = @{
    email = "staging-test@example.com"
    password = "StagingTest123!"
    companyName = "Staging Test Co"
} | ConvertTo-Json

curl -X POST `
  -H "Content-Type: application/json" `
  -d $body `
  https://staging-caly.railway.app/api/auth/register
```

### Step 9: Run Smoke Tests (24 hours)

Keep staging running for 24 hours and verify:

- [ ] Server stays up (no crashes)
- [ ] Health endpoint responds
- [ ] Swagger docs load
- [ ] Can register new account
- [ ] Can login with account
- [ ] Can complete onboarding
- [ ] Dashboard loads and shows data
- [ ] No errors in logs

```powershell
# View logs
railway logs --follow
```

### Step 10: Deploy to Production

```powershell
# Update environment to production
railway variable update NODE_ENV "production"
railway variable update API_URL "https://api.caly.ai"

# Deploy
railway up
```

### Step 11: Production Verification

```powershell
# Test production API
curl https://api.caly.ai/health
curl https://api.caly.ai/api/docs

# Monitor logs for errors
railway logs --follow

# Check database size
railway exec psql -U $DB_USER -d $DB_NAME -c "SELECT pg_size_pretty(pg_database_size('caly_db'));"
```

---

## PRODUCTION CONFIGURATION

### HTTPS/SSL Setup

**For Railway:** Automatic (included with Railway domains)

**For custom domain:** Use Let's Encrypt + Certbot

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d api.caly.ai

# Auto-renew
sudo certbot renew --dry-run
```

### Database Backup

```bash
# Create backup directory
mkdir -p /backups

# Backup database
pg_dump -U caly_user -d caly_db > /backups/caly_$(date +%Y%m%d_%H%M%S).sql

# Automate with cron (daily at 2 AM)
0 2 * * * pg_dump -U caly_user -d caly_db > /backups/caly_$(date +\%Y\%m\%d_\%H\%M\%S).sql
```

### Monitoring Setup

```javascript
// Add to server.js for production monitoring
if (process.env.SENTRY_DSN) {
  const Sentry = require("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  app.use(Sentry.Handlers.errorHandler());
}

// Or use DataDog APM
const tracer = require('dd-trace').init({
  hostname: 'localhost',
  port: 8126
});
```

### Load Balancing (For Scale)

```nginx
# nginx.conf
upstream caly_backend {
  server backend1:8080 weight=3;
  server backend2:8080 weight=3;
  server backend3:8080 weight=3;
}

server {
  listen 443 ssl http2;
  server_name api.caly.ai;

  ssl_certificate /etc/letsencrypt/live/api.caly.ai/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.caly.ai/privkey.pem;

  location / {
    proxy_pass http://caly_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
  }
}
```

---

## TROUBLESHOOTING

### Database Connection Failed

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
```powershell
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL
pg_ctl -D "C:\Program Files\PostgreSQL\data" start

# Or use PostgreSQL service
Start-Service PostgreSQL
```

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::8080
```

**Solution:**
```powershell
# Find process using port 8080
netstat -ano | findstr :8080

# Kill process (replace PID)
taskkill /PID 12345 /F

# Or change port in .env
PORT=8081
```

### JWT Secret Missing

```
Error: JWT_SECRET must be defined in environment variables
```

**Solution:**
```powershell
$env:JWT_SECRET = "your-super-secret-key-min-32-characters"
npm start
```

### Swagger Not Loading

```
Error: Cannot find swagger-ui-express or swagger-jsdoc
```

**Solution:**
```powershell
cd Backend
npm install swagger-ui-express swagger-jsdoc
```

---

## ROLLBACK PROCEDURE

If something goes wrong in production:

### Option 1: Immediate Rollback (Railway)

```powershell
# View deployment history
railway deployments

# Redeploy previous version
railway redeploy <previous-deployment-id>
```

### Option 2: Manual Rollback

```powershell
# Stop current server
railway stop

# Restore database from backup
psql -U caly_user -d caly_db < /backups/caly_backup.sql

# Redeploy previous code
git checkout <previous-commit>
railway up
```

---

## MONITORING CHECKLIST

After deployment, monitor these metrics:

- [ ] CPU usage (should be <30%)
- [ ] Memory usage (should be <50%)
- [ ] Database connections (should be <10)
- [ ] Response time (should be <100ms average)
- [ ] Error rate (should be <0.1%)
- [ ] Request volume (track daily growth)
- [ ] Active users (track concurrent connections)

---

## SUCCESS CRITERIA

Deployment is successful when:

✅ Health endpoint returns `{"status": "ok"}`  
✅ Swagger docs load at `/api/docs`  
✅ Can register new account  
✅ Can login and get JWT token  
✅ Can access protected routes  
✅ Database is accessible  
✅ WebSocket connection works  
✅ No errors in logs for 24 hours  

---

## CONTACTS & SUPPORT

**For Railway Support:**
- Docs: https://docs.railway.app
- Status: https://status.railway.app
- Chat: Open ticket in Railway dashboard

**For Caly Issues:**
- Check `/api/docs` for API docs
- View logs: `railway logs`
- Check database: `railway exec psql`

---

**Document Version:** 1.0.0  
**Last Updated:** November 25, 2025  
**Deployment Status:** READY TO DEPLOY NOW  
