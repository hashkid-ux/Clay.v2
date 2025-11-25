// DEVELOPER QUICK START - Caly v3 Progress

## Current Status (End of Phase 2)

✅ **Authentication System** - COMPLETE
✅ **Multi-Tenancy Enforcement** - COMPLETE  
✅ **Frontend Dashboard** - COMPLETE
✅ **Settings Management** - COMPLETE

🔄 **NEXT**: Build CallsPage, AnalyticsPage, Team Management

---

## How to Continue Development

### 1. Run the Full Stack (Local)

```bash
# Terminal 1: Start backend
cd Backend
npm install  # (if needed)
npm start    # or node server.js

# Terminal 2: Start frontend  
cd Frontend
npm install  # (if needed)
npm start    # starts on http://localhost:3000
```

### 2. Database Setup

```bash
# Initialize auth tables (if not already done)
node Backend/scripts/init-auth-db.js

# Add sample company to test (optional)
psql $DATABASE_URL -f Backend/db/auth-schema.sql
```

### 3. Environment Variables

**Backend/.env**
```
# API
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/caly

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRY=24h
REFRESH_TOKEN_EXPIRY=7d

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@caly.ai

# OpenAI
OPENAI_API_KEY=sk-xxx
OPENAI_REALTIME_API_URL=wss://api.openai.com/realtime

# Exotel (populate from customer account)
EXOTEL_SID=your-sid
EXOTEL_TOKEN=your-token

# Optional
LOG_LEVEL=debug
SENTRY_DSN=https://...
```

**Frontend/.env**
```
REACT_APP_API_URL=http://localhost:3000
REACT_APP_ENV=development
```

### 4. Test the Auth Flow

```bash
# Register new company
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@company.com",
    "password": "Test@123456",
    "companyName": "Test Company",
    "firstName": "John",
    "lastName": "Doe"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@company.com",
    "password": "Test@123456"
  }'

# Use returned JWT for protected routes
curl http://localhost:3000/api/calls \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## What Each File Does

### Core Auth System
- `Backend/auth/jwtUtils.js` → Token signing/verification
- `Backend/auth/passwordUtils.js` → Password hashing + validation
- `Backend/auth/authMiddleware.js` → JWT verification + multi-tenancy check
- `Backend/routes/auth.js` → Register/login/verify/refresh endpoints

### Frontend Auth
- `Frontend/src/context/AuthContext.jsx` → Global auth state + useAuth() hook
- `Frontend/src/components/ProtectedRoute.jsx` → Route guard wrapper
- `Frontend/src/utils/axiosInstance.js` → HTTP client with auto-token refresh
- `Frontend/src/pages/LoginPage.jsx` → Email/password login
- `Frontend/src/pages/RegisterPage.jsx` → 2-step company registration with OTP

### Frontend Dashboard
- `Frontend/src/App.js` → Router with auth integration
- `Frontend/src/components/Dashboard.jsx` → Main KPI dashboard
- `Frontend/src/pages/OnboardingPage.jsx` → 4-step setup wizard
- `Frontend/src/pages/SettingsPage.jsx` → Company configuration

### API Routes (Multi-Tenant)
- `Backend/routes/calls.js` → Calls API (filtered by client_id)
- `Backend/routes/analytics.js` → Analytics KPIs (filtered by client_id)
- `Backend/routes/clients.js` → Company config management (verified by owner)

---

## Key Architectural Patterns

### 1. Multi-Tenancy (Database Level)
```javascript
// Pattern used EVERYWHERE:
const query = 'SELECT * FROM table WHERE client_id = $1 AND ...';
const params = [req.user.client_id, ...];

// User can ONLY access their own company's data
// Even if they somehow craft a malicious JWT, they need client_id in JWT
```

### 2. Protected Routes (Frontend)
```javascript
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />

// If not authenticated, redirects to /login
```

### 3. Token Refresh (Auto-Logout)
```javascript
// axiosInstance auto-handles:
// GET /api/data → 401 (token expired)
// → POST /api/auth/refresh with refreshToken
// → Get new accessToken
// → Retry original request
// → If refresh fails → localStorage cleared → redirect to /login
```

### 4. Settings Management
```javascript
// All company config stored in JSON column:
clients.settings = {
  shopify: { store, apiKey, apiSecret },
  exotel: { number, sid, token },
  business: { returnWindowDays, refundAutoThreshold, ... },
  channels: { whatsApp, sms, email },
  localization: { timezone, language }
}
```

---

## Next Tasks (Ranked by Priority)

### HIGH (Next 2 hours)
- [ ] **CallsPage.jsx** - List all calls with filters
  - GET `/api/calls?limit=50&offset=0` (already filtered by client_id)
  - Table view with columns: date, phone, duration, resolved, sentiment
  - Click row to see call details + transcript
  
- [ ] **CallDetailPage.jsx** - Single call view
  - Call metadata, full transcript, actions taken
  - Sentiment analysis, customer feedback score
  - Download recording if available

- [ ] **AnalyticsPage.jsx** - Detailed metrics
  - Date range picker
  - Charts: call volume, duration, resolution rate, revenue
  - Action breakdown (refunds, cancellations, etc)

### MEDIUM (Next 4-6 hours)
- [ ] **TeamPage.jsx** - Invite team members
  - Show invited users, roles (admin/agent/viewer)
  - Send invite via email
  - Revoke access

- [ ] **IntegrationsPage.jsx** - Manage API keys
  - View client_id (for API access)
  - Generate/revoke API keys
  - Webhook management

### LOW (Week 2+)
- [ ] Billing system (charge per-minute calls)
- [ ] Escalation queue (confidence < 60% → human)
- [ ] Call recording playback
- [ ] Advanced analytics (export data, reports)

---

## Testing Checklist

Before merging any code:

```bash
# ✅ Auth flows work
- [ ] Register new company (email verification)
- [ ] Login with correct/incorrect password
- [ ] Access /dashboard (should redirect if not logged in)
- [ ] Token refresh when calling API with expired token
- [ ] Logout clears localStorage and redirects to /login

# ✅ Multi-tenancy works
- [ ] Company A cannot see Company B's calls
- [ ] Analytics only shows Company A's data
- [ ] Settings PUT only updates own company

# ✅ UI is responsive
- [ ] Mobile view (< 640px)
- [ ] Tablet view (640-1024px)
- [ ] Desktop view (> 1024px)

# ✅ No console errors
- [ ] Check browser console for errors
- [ ] No unhandled promise rejections
- [ ] No TypeScript errors (if using TS)
```

---

## Deployment Checklist

When ready to go production:

```
Backend (Railway):
- [ ] Set NODE_ENV=production
- [ ] Use strong JWT_SECRET (32+ chars, random)
- [ ] Configure PostgreSQL on Railway
- [ ] Set EMAIL credentials (Gmail app password)
- [ ] Enable HTTPS (Railway auto does this)
- [ ] Set up logging/monitoring (Sentry)

Frontend (Vercel):
- [ ] Set REACT_APP_API_URL=https://your-api.railway.app
- [ ] Build passes without errors
- [ ] No console warnings in production build
- [ ] Test all auth flows on live domain

Database:
- [ ] Run migrations (init-auth-db.js if not done)
- [ ] Set up backups (daily)
- [ ] Test restore from backup
- [ ] Monitor query performance
```

---

## Common Issues & Fixes

### Issue: "Cannot find module 'lucide-react'"
```bash
# Solution:
cd Frontend
npm install lucide-react
```

### Issue: JWT token expired, getting 401
```javascript
// Solution: axiosInstance should auto-refresh
// If not, check:
1. localStorage has refreshToken
2. /api/auth/refresh endpoint is working
3. REFRESH_TOKEN_EXPIRY is set in .env
```

### Issue: "Unauthorized" on API calls
```javascript
// Possible causes:
1. JWT not included in header (axiosInstance should do this)
2. req.user.client_id doesn't match company data
3. Token is invalid (check JWT_SECRET matches)

// Debug:
- Log req.headers in authMiddleware
- Verify JWT decode (jwt.verify) works
- Check DatabaseURL points to correct schema
```

### Issue: Onboarding wizard not saving
```javascript
// Check:
1. PUT /api/clients/{id} returns 200
2. enforceClientAccess middleware allows PUT
3. clients table has settings column (JSON type)
4. Frontend user.clientId is set correctly
```

---

## Useful Commands

```bash
# Check database schema
psql $DATABASE_URL -c "SELECT * FROM clients LIMIT 1;"

# Clear auth tables (development only!)
psql $DATABASE_URL -c "TRUNCATE company_users CASCADE;"

# Test email sending
node Backend/scripts/test-email.js

# Run all backend tests (if implemented)
npm test

# Build frontend for production
cd Frontend && npm run build

# Preview production build
cd Frontend && npm run serve
```

---

## Architecture Decision Log

### Why JWT + Refresh Tokens?
- ✅ Stateless (no session storage needed)
- ✅ Easy to scale horizontally
- ✅ Mobile-friendly (works with native apps)
- ✅ Automatic logout after 7 days (refresh expiry)

### Why Multi-Tenancy at Database Level?
- ✅ Prevents bugs (accidental cross-company queries fail fast)
- ✅ Better performance (filtered queries are smaller)
- ✅ Compliance (easier to audit who accessed what data)
- ✅ Separation of concerns (each company isolated)

### Why Settings as JSON?
- ✅ Flexible schema (add new settings without migration)
- ✅ Type-safe at application level
- ✅ Easy to version/track changes
- ✅ Good for PostgreSQL native JSON support

---

**Last Updated**: Phase 2 Complete
**Next Review**: After Phase 3 (CallsPage, Analytics, Team Management)
**Estimated Time Remaining**: 4-6 weeks to full production
