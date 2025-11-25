# 🎯 CALY v3 - REAL PRODUCT ROADMAP
## Transform Broken Prototype → Sellable Product (14 Days)

**Status:** Starting NOW (November 25, 2025)  
**Target Completion:** December 9, 2025  
**Goal:** Production-ready, investor-pitchable, customer-sellable  

---

## 📋 PHASE A: CRITICAL BLOCKERS (Days 1-3)
### Make ONE end-to-end flow work perfectly

### A1: Test Complete End-to-End Flow ⏱️ 3 hours
**Current State:** Unknown if register→login→onboard→call works  
**Target State:** Full flow works without errors  

**Steps:**
```
1. Create test user account (manual SQL insert)
2. Register new account via UI → VERIFY API called
3. Login with email/password → VERIFY JWT received
4. Complete onboarding → VERIFY data saved in database
5. Make test call to business number → VERIFY webhooks received
6. Check dashboard → VERIFY call appears
7. Play recording → VERIFY URL works
```

**Success Criteria:**
- Registration creates user in database ✓
- Login returns valid JWT token ✓
- Onboarding persists to database ✓
- Call data shows in dashboard ✓

**Failure Investigation:**
```
If fails at step X:
- Check server logs for errors
- Check database for records
- Check network requests (F12 DevTools)
- Check console for JavaScript errors
```

---

### A2: Create ProtectedRoute Component ⏱️ 1 hour
**File:** `Frontend/src/components/ProtectedRoute.jsx`

**Current Problem:** No route protection, anyone can access /dashboard by URL

**Implementation:**
```javascript
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user || !localStorage.getItem('accessToken')) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
```

**Update App.js routes:**
```javascript
<Route
  path="/dashboard"
  element={
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  }
/>
```

---

### A3: Connect Dashboard to Real API ⏱️ 2 hours
**File:** `Frontend/src/pages/Dashboard.jsx`

**Current Problem:** Shows hardcoded data (Today's Calls: 42)

**Fix Steps:**

1. **Remove mock data:**
```javascript
// DELETE THESE:
const mockData = { calls: 42, revenue: 1260, ... };
const [data, setData] = useState(mockData); // WRONG
```

2. **Add real API call:**
```javascript
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const { getAuthHeader } = useAuth();

useEffect(() => {
  const fetchDashboard = async () => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/analytics/dashboard`,
        { headers: getAuthHeader() }
      );
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Dashboard error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  fetchDashboard();
}, [getAuthHeader]);
```

3. **Show loading state:**
```javascript
if (loading) return <div>Loading dashboard...</div>;
if (error) return <div>Error: {error}</div>;
```

4. **Verify backend endpoint exists:**
```javascript
// Backend/routes/analytics.js
// GET /api/analytics/dashboard should return real data
// NOT hardcoded values
```

---

### A4: Implement Email OTP Verification ⏱️ 2 hours

**File:** `Backend/routes/auth.js` + `Backend/services/emailService.js`

**Current State:** Frontend has OTP form but backend doesn't generate/send

**Steps:**

1. **Add OTP to database schema:**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS (
  otp_code VARCHAR(6),
  otp_expires_at TIMESTAMP,
  is_verified BOOLEAN DEFAULT false
);
```

2. **Backend: Generate OTP on register:**
```javascript
// POST /api/auth/register
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

router.post('/register', async (req, res) => {
  const { email, password, companyName } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check if email already exists
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  // Generate OTP
  const otpCode = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60000); // 10 min

  // Create user
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.query(
    'INSERT INTO users (email, password_hash, company_name, otp_code, otp_expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, email',
    [email, hashedPassword, companyName, otpCode, otpExpires]
  );

  // Send OTP email
  await emailService.sendOTP(email, otpCode);

  res.status(201).json({
    success: true,
    message: 'OTP sent to email. Please verify to continue.',
    userId: result.rows[0].id
  });
});
```

3. **Backend: Verify OTP:**
```javascript
// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  const result = await db.query(
    'SELECT id, otp_code, otp_expires_at FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = result.rows[0];

  // Check OTP validity
  if (user.otp_code !== otp) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  if (new Date() > user.otp_expires_at) {
    return res.status(400).json({ error: 'OTP expired' });
  }

  // Mark as verified
  await db.query(
    'UPDATE users SET is_verified = true, otp_code = NULL WHERE id = $1',
    [user.id]
  );

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

  res.json({
    success: true,
    accessToken: token,
    message: 'Email verified successfully'
  });
});
```

4. **Frontend: Add OTP input page:**
```javascript
// Frontend/src/pages/VerifyOTPPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function VerifyOTPPage() {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const email = localStorage.getItem('registerEmail');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/auth/verify-otp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      localStorage.setItem('accessToken', data.accessToken);
      navigate('/onboarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Enter 6-digit OTP"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
        maxLength="6"
      />
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button disabled={loading}>{loading ? 'Verifying...' : 'Verify'}</button>
    </form>
  );
}
```

---

### A5: Implement Billing System ⏱️ 3 hours

**File:** `Backend/services/billingService.js` + database schema update

**Current State:** No charges created after calls

**Implementation:**

1. **Add billing table:**
```sql
CREATE TABLE IF NOT EXISTS charges (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  call_id INTEGER NOT NULL REFERENCES calls(id),
  amount DECIMAL(10, 2) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  rate_per_minute DECIMAL(10, 2) DEFAULT 30.00, -- ₹30/min
  created_at TIMESTAMP DEFAULT NOW(),
  invoice_id VARCHAR(100),
  status VARCHAR(50) DEFAULT 'created' -- created, invoiced, paid
);
```

2. **Create billing service:**
```javascript
// Backend/services/billingService.js
class BillingService {
  static async createChargeOnCallEnd(callId) {
    const db = require('../db/postgres');
    
    // Get call details
    const callResult = await db.query(
      'SELECT client_id, start_ts, end_ts FROM calls WHERE id = $1',
      [callId]
    );

    if (callResult.rows.length === 0) {
      throw new Error('Call not found');
    }

    const { client_id, start_ts, end_ts } = callResult.rows[0];

    // Calculate duration in minutes
    const durationMs = new Date(end_ts) - new Date(start_ts);
    const durationMinutes = Math.ceil(durationMs / 60000);

    // Calculate charge
    const ratePerMinute = 30; // ₹30/min
    const amount = durationMinutes * ratePerMinute;

    // Create charge record
    await db.query(
      'INSERT INTO charges (client_id, call_id, amount, duration_seconds) VALUES ($1, $2, $3, $4)',
      [client_id, callId, amount, Math.round(durationMs / 1000)]
    );

    // Update call with cost
    await db.query(
      'UPDATE calls SET call_cost = $1 WHERE id = $2',
      [amount, callId]
    );

    return { callId, amount, duration: durationMinutes };
  }

  static async getClientInvoice(clientId, month) {
    const db = require('../db/postgres');
    
    // Get all charges for the month
    const result = await db.query(
      'SELECT SUM(amount) as total, COUNT(*) as call_count FROM charges WHERE client_id = $1 AND DATE_TRUNC(\'month\', created_at) = DATE_TRUNC(\'month\', $2::date)',
      [clientId, month]
    );

    return result.rows[0];
  }
}

module.exports = BillingService;
```

3. **Trigger charge creation when call ends:**
```javascript
// Backend/routes/exotel.js
// POST /webhooks/exotel/call-end

const billingService = require('../services/billingService');

router.post('/call-end', webhookVerifier.middleware(process.env.EXOTEL_TOKEN), async (req, res) => {
  try {
    const { callId } = req.body;

    // Create charge
    await billingService.createChargeOnCallEnd(callId);

    res.json({ success: true });
  } catch (err) {
    logger.error('Charge creation failed:', err);
    res.status(500).json({ error: err.message });
  }
});
```

4. **Dashboard shows actual charges:**
```javascript
// Dashboard should now show real ₹ values from database
```

---

### A6: Test Exotel Webhook Integration ⏱️ 2 hours

**Current State:** Webhooks configured but untested

**Testing Checklist:**

1. **Verify Exotel has webhook URL:**
   - Go to Exotel dashboard
   - Check webhook URL is set to your production domain
   - Example: `https://api.caly.ai/webhooks/exotel/call-start`

2. **Test webhook signature verification:**
```javascript
// Backend/utils/webhookVerifier.js - Already exists, verify it works
// Test with curl:
curl -X POST http://localhost:8080/webhooks/exotel/call-start \
  -H "Content-Type: application/json" \
  -H "X-Exotel-Signature: <test-signature>" \
  -d '{"callId": "123", "from": "+919999999999"}'
```

3. **Verify webhook creates call record:**
```javascript
// After sending webhook, check database:
SELECT * FROM calls WHERE id = 123;
// Should show: client_id, phone_from, status='ongoing', start_ts
```

4. **Test call-end webhook:**
```javascript
// Send call-end webhook
// Check: call status = 'completed', end_ts filled, charge created
SELECT * FROM calls WHERE id = 123;
SELECT * FROM charges WHERE call_id = 123;
```

---

### A7: Implement Call Recording Retrieval ⏱️ 1.5 hours

**File:** `Backend/routes/recordings.js`

**Current State:** Recording URL saved but can't retrieve

**Implementation:**

1. **Create GET endpoint:**
```javascript
// Backend/routes/recordings.js
const wasabiService = require('../services/wasabiStorage');

router.get('/:callId/recording', authMiddleware, async (req, res) => {
  try {
    const { callId } = req.params;
    const { user } = req;

    // Verify user owns this call
    const callResult = await db.query(
      'SELECT id, client_id, recording_url FROM calls WHERE id = $1',
      [callId]
    );

    if (callResult.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = callResult.rows[0];

    // Check authorization
    if (call.client_id !== user.client_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Generate signed S3 URL (valid for 1 hour)
    const signedUrl = await wasabiService.generateSignedUrl(
      call.recording_url,
      3600 // 1 hour
    );

    res.json({
      success: true,
      callId,
      recordingUrl: signedUrl,
      expiresIn: 3600
    });
  } catch (err) {
    logger.error('Recording retrieval failed:', err);
    res.status(500).json({ error: err.message });
  }
});
```

2. **Frontend: Play recording:**
```javascript
// Frontend/src/components/RecordingPlayer.jsx
export default function RecordingPlayer({ callId }) {
  const [recordingUrl, setRecordingUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const { getAuthHeader } = useAuth();

  useEffect(() => {
    const fetchRecording = async () => {
      try {
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/recordings/${callId}/recording`,
          { headers: getAuthHeader() }
        );
        const data = await response.json();
        setRecordingUrl(data.recordingUrl);
      } catch (err) {
        console.error('Failed to load recording:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecording();
  }, [callId]);

  if (loading) return <div>Loading...</div>;

  return (
    <audio controls>
      <source src={recordingUrl} type="audio/wav" />
      Your browser does not support audio playback.
    </audio>
  );
}
```

---

## 📋 PHASE B: BUSINESS LOGIC (Days 4-6)
### Make integrations actually work

### B1: Validate Shopify API Keys ⏱️ 1.5 hours

**File:** `Backend/services/shopifyConnector.js`

**Current State:** Keys accepted without validation

**Implementation:**
```javascript
class ShopifyConnector {
  static async validateCredentials(apiKey, password) {
    try {
      // Test connection with minimal API call
      const response = await fetch(
        `https://${apiKey}:${password}@YOUR_STORE.myshopify.com/admin/api/2024-01/shop.json`,
        { method: 'GET' }
      );

      if (!response.ok) {
        return {
          valid: false,
          error: 'Invalid credentials'
        };
      }

      const data = await response.json();

      return {
        valid: true,
        shopName: data.shop.name,
        plan: data.shop.plan_display_name
      };
    } catch (err) {
      return {
        valid: false,
        error: err.message
      };
    }
  }
}
```

**Use in onboarding:**
```javascript
// Backend/routes/onboarding.js
router.post('/complete', authMiddleware, async (req, res) => {
  const { shopifyApiKey, shopifyPassword, exotelSid, exotelToken } = req.body;

  // Validate Shopify
  const shopifyValid = await shopifyConnector.validateCredentials(shopifyApiKey, shopifyPassword);
  if (!shopifyValid.valid) {
    return res.status(400).json({ error: shopifyValid.error });
  }

  // Validate Exotel
  const exotelValid = await exotelConnector.validateCredentials(exotelSid, exotelToken);
  if (!exotelValid.valid) {
    return res.status(400).json({ error: exotelValid.error });
  }

  // Save if both valid
  await db.query(
    'UPDATE clients SET shopify_api_key = $1, exotel_sid = $2 WHERE id = $3',
    [shopifyApiKey, exotelSid, req.user.client_id]
  );

  res.json({ success: true, message: 'Setup complete' });
});
```

---

### B2: Validate Exotel Credentials ⏱️ 1.5 hours

Similar to Shopify - test connection to Exotel API on setup

```javascript
class ExotelConnector {
  static async validateCredentials(sid, token) {
    try {
      const response = await fetch(
        `https://${sid}:${token}@api.exotel.com/v2/accounts/${sid}/balance`,
        { method: 'GET' }
      );

      if (!response.ok) {
        return { valid: false, error: 'Invalid credentials' };
      }

      const data = await response.json();
      return {
        valid: true,
        balance: data.balance
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}
```

---

### B3: Register Webhook with Exotel ⏱️ 1.5 hours

**Current State:** Customer manually configures webhook in Exotel

**Better:** Auto-register webhook during onboarding

```javascript
class ExotelConnector {
  static async registerWebhook(sid, token, webhookUrl) {
    try {
      const response = await fetch(
        `https://${sid}:${token}@api.exotel.com/v2/accounts/${sid}/webhooks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            events: ['call.initiated', 'call.ended', 'recording.available']
          })
        }
      );

      if (!response.ok) {
        throw new Error('Webhook registration failed');
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

// Use in onboarding after validation
await exotelConnector.registerWebhook(
  exotelSid,
  exotelToken,
  `https://api.caly.ai/webhooks/exotel/call-start`
);
```

---

### B4: Implement Form Validation ⏱️ 1.5 hours

**Files:** Frontend forms

**Email validation:**
```javascript
const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};
```

**Password validation:**
```javascript
const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) errors.push('Minimum 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('Needs uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Needs number');
  if (!/[!@#$%^&*]/.test(password)) errors.push('Needs special character');
  return errors;
};
```

**Form implementation:**
```javascript
// Frontend/src/pages/RegisterPage.jsx
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [errors, setErrors] = useState({});

const handleSubmit = (e) => {
  e.preventDefault();
  const newErrors = {};

  if (!isValidEmail(email)) {
    newErrors.email = 'Invalid email format';
  }

  const pwdErrors = validatePassword(password);
  if (pwdErrors.length > 0) {
    newErrors.password = pwdErrors;
  }

  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }

  // Submit form
};

return (
  <form onSubmit={handleSubmit}>
    <input
      type="email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />
    {errors.email && <span style={{color: 'red'}}>{errors.email}</span>}

    <input
      type="password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
    />
    {errors.password && (
      <ul style={{color: 'red'}}>
        {errors.password.map(err => <li key={err}>{err}</li>)}
      </ul>
    )}
  </form>
);
```

---

### B5: Add Error Handling to API Calls ⏱️ 2 hours

**Create axios interceptor:**
```javascript
// Frontend/src/utils/axiosInstance.js
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export const createAxiosInstance = (logout) => {
  const instance = axios.create({
    baseURL: process.env.REACT_APP_API_URL
  });

  // Response interceptor
  instance.interceptors.response.use(
    response => response,
    error => {
      if (error.response?.status === 401) {
        // Token expired, logout user
        logout();
        window.location.href = '/login';
      }

      if (error.response?.status === 403) {
        // Forbidden
        throw new Error('You do not have permission');
      }

      if (error.response?.status === 500) {
        // Server error
        throw new Error('Server error. Please try again later.');
      }

      throw error;
    }
  );

  return instance;
};
```

---

### B6: Implement Loading States ⏱️ 1 hour

**Pattern for all forms:**
```javascript
const [loading, setLoading] = useState(false);

const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');

  try {
    // API call
    await api.post('/something', data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

return (
  <button disabled={loading}>
    {loading ? 'Loading...' : 'Submit'}
  </button>
);
```

---

### B7: Test All 14 Agents with Real Data ⏱️ 4 hours

**Testing procedure:**
```
For each agent:
1. Prepare test Shopify store with sample data
2. Create test call (simulate Exotel webhook)
3. Send different customer queries
4. Verify agent responds correctly
5. Log any errors

Agents to test:
1. ProductInquiryAgent - "What are your products?"
2. OrderLookupAgent - "Where is my order?"
3. TrackingAgent - "Track my package"
... (14 total)
```

**Create test cases document:**
- Store location of test case results
- Document any agent failures
- Create fallback for failing agents

---

## 📋 PHASE C: DATA INTEGRITY (Days 7-8)
### Ensure data quality and persistence

### C1: Update Database Schema ⏱️ 1 hour

```sql
-- Add missing columns to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS (
  api_key_secret VARCHAR(255),
  webhook_url VARCHAR(500),
  webhook_secret VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  monthly_credit DECIMAL(10, 2),
  used_credit DECIMAL(10, 2) DEFAULT 0
);

-- Create webhook tracking table
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  event_type VARCHAR(100),
  payload JSONB,
  status VARCHAR(50), -- received, processed, failed
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create call transcripts
CREATE TABLE IF NOT EXISTS call_transcripts (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES calls(id),
  speaker VARCHAR(20), -- 'customer' or 'agent'
  text TEXT,
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### C2: Create Call Transcripts During Calls ⏱️ 2 hours

**During call processing:**
```javascript
// Backend/sessions/CallSessionManager.js
class CallSessionManager {
  async processCustomerInput(callId, audioData) {
    // Transcribe speech to text
    const transcript = await whisperService.transcribe(audioData);

    // Save customer transcript
    await db.query(
      'INSERT INTO call_transcripts (call_id, speaker, text) VALUES ($1, $2, $3)',
      [callId, 'customer', transcript]
    );

    // Get agent response
    const agentResponse = await agentOrchestrator.handle(callId, transcript);

    // Save agent response
    await db.query(
      'INSERT INTO call_transcripts (call_id, speaker, text) VALUES ($1, $2, $3)',
      [callId, 'agent', agentResponse.text]
    );

    // Generate TTS
    const audio = await twilioService.textToSpeech(agentResponse.text);

    return audio;
  }
}
```

---

### C3: Store All Agent Responses ⏱️ 1 hour

```sql
CREATE TABLE IF NOT EXISTS agent_responses (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES calls(id),
  agent_type VARCHAR(100), -- 'OrderLookupAgent', etc
  customer_input TEXT,
  agent_output TEXT,
  confidence_score DECIMAL(5, 2),
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### C4: Database Backup Automation ⏱️ 1.5 hours

**Create backup script:**
```bash
#!/bin/bash
# Backend/scripts/backup-database.sh

BACKUP_DIR="/backups/caly"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="caly_backup_${DATE}.sql"

mkdir -p $BACKUP_DIR

# Backup
pg_dump $DATABASE_URL > $BACKUP_DIR/$FILENAME

# Compress
gzip $BACKUP_DIR/$FILENAME

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $FILENAME"
```

**Schedule with cron (production server):**
```
0 2 * * * /path/to/backup-database.sh
```

---

### C5: Data Validation on Write ⏱️ 1.5 hours

**Before inserting any data:**
```javascript
// Backend/middleware/dataValidation.js

const validateCallData = (data) => {
  const errors = [];

  if (!data.client_id || typeof data.client_id !== 'number') {
    errors.push('Invalid client_id');
  }

  if (!data.phone_from || !/^\+?[0-9]{10,}$/.test(data.phone_from)) {
    errors.push('Invalid phone number');
  }

  if (data.duration && isNaN(data.duration)) {
    errors.push('Invalid duration');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// Use before inserting
const validation = validateCallData(req.body);
if (!validation.valid) {
  return res.status(400).json({ errors: validation.errors });
}
```

---

## 📋 PHASE D: PRODUCTION HARDENING (Days 9-10)
### Make it not explode in production

### D1: Setup Sentry Error Tracking ⏱️ 1 hour

**Backend:**
```bash
npm install @sentry/node
```

```javascript
// Backend/server.js - TOP OF FILE
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

**Frontend:**
```bash
npm install @sentry/react
```

```javascript
// Frontend/src/main.jsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.REACT_APP_ENV,
  tracesSampleRate: 1.0,
});
```

---

### D2: Setup Monitoring Dashboard ⏱️ 2 hours

Use **free** options:
- **Uptime:** Betterstack.com (free tier)
- **Logs:** Railway built-in logging
- **Status Page:** Cachet or Instatus (free tier)

**Create monitoring checklist:**
- Server uptime
- API response time
- Error rate
- Database connection count
- Memory usage
- CPU usage

---

### D3: Create Alert System ⏱️ 1.5 hours

**Use Sentry alerts:**
- Alert when error rate > 5%
- Alert when response time > 1 second
- Alert when database error occurs

**Send to Telegram/Email**

---

### D4: Test Rate Limiting Under Load ⏱️ 1.5 hours

```bash
npm install -g artillery

# Create load test
echo "
config:
  target: 'http://localhost:8080'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: 'Test Rate Limiting'
    requests:
      - url: '/api/auth/login'
        method: POST
        json:
          email: 'test@example.com'
          password: 'password'
" > load-test.yml

artillery run load-test.yml
```

---

### D5: Security Audit ⏱️ 2 hours

**Checklist:**
- [ ] SQL injection tests (parameterized queries used)
- [ ] XSS tests (input validation in place)
- [ ] CSRF tests (SameSite cookies configured)
- [ ] Authentication tests (JWT valid/expired)
- [ ] Authorization tests (multi-tenancy enforced)
- [ ] API key exposure (secrets not in code)
- [ ] HTTPS enforced
- [ ] CORS properly configured

---

## 📋 PHASE E: CUSTOMER EXPERIENCE (Days 11-12)
### Build trust and credibility

### E1-E6: Create Documents ⏱️ 4 hours total

**E1: Terms of Service (1 hour)**
- How service works
- Payment terms
- Refund policy
- Liability limits
- Termination clause

**E2: Privacy Policy (1 hour)**
- What data we collect
- How we use it
- GDPR compliance
- Data retention
- User rights

**E3: SLA Documentation (30 min)**
- 99.9% uptime target
- Response time SLA
- Support hours
- Escalation procedure

**E4: Support System (30 min)**
- Support email: support@caly.ai
- Response time: 24 hours
- Chat widget on website (optional)

**E5: Onboarding Documentation (1 hour)**
- Getting started guide
- Step-by-step setup
- Screenshots
- FAQ

**E6: API Documentation (1 hour)**
- Webhook specification
- API endpoints
- Error codes
- Examples

---

## 📋 PHASE F: TESTING & VALIDATION (Days 13-14)
### Prove it works before pitching

### F1: Full End-to-End Test ⏱️ 3 hours

**Create test scenario document:**
```
Test 1: New Customer Onboarding
- Register account ✓ or ✗
- Verify email ✓ or ✗
- Complete Shopify setup ✓ or ✗
- Complete Exotel setup ✓ or ✗
- See "Ready" status ✓ or ✗

Test 2: Incoming Call
- Call business number ✓ or ✗
- Agent picks up ✓ or ✗
- Agent responds to query ✓ or ✗
- Call recorded ✓ or ✗
- Call appears in dashboard ✓ or ✗

Test 3: Recording & Billing
- View call in dashboard ✓ or ✗
- Play recording ✓ or ✗
- Charge appears in billing ✓ or ✗
- Invoice generated ✓ or ✗
```

**Document ALL failures and fixes**

---

### F2: Beta Test with 3 Customers ⏱️ 5 days

**Recruitment:**
- Find 3 small e-commerce stores
- Offer free 1-week trial
- Collect feedback

**Feedback form:**
- Was setup easy? (1-5)
- Did agent respond correctly? (Y/N)
- Would you recommend? (Y/N)
- What could improve?

**What to fix:**
- Critical bugs: Fix immediately
- UX issues: Document for next sprint
- Feature requests: Add to roadmap

---

### F3: Load Testing ⏱️ 2 hours

```bash
artillery quick --count 100 --num 10 http://localhost:8080/api/health
```

**What to verify:**
- Can handle 100+ concurrent requests
- Response time < 200ms under load
- No database connection pool exhaustion
- No memory leaks

---

### F4: Security Testing ⏱️ 2 hours

```bash
# Test common vulnerabilities
npm install -g snyk
snyk test
```

**Manual tests:**
- Try accessing other customer's data
- Try SQL injection in inputs
- Try XSS in forms
- Try calling API without token

---

## 📋 PHASE G: PITCH READY (Days 15-16)
### Get ready to close deals

### G1: Create Investor Pitch Deck ⏱️ 3 hours

**Slides needed:**
1. Problem (customer support is expensive)
2. Solution (Caly AI agents)
3. Market (size & opportunity)
4. Product (demo video)
5. Traction (beta customers)
6. Team
7. Financial projections
8. The ask (funding needed)

### G2: Prepare Live Demo ⏱️ 2 hours

**Demo script:**
```
1. Open Swagger API docs
2. Register test account (show live)
3. Login (show JWT token)
4. Complete onboarding
5. Show dashboard with real metrics
6. Play actual call recording
7. Show billing charges
8. Explain agent system
```

**Backup:** Pre-recorded video if live fails

---

### G3: Deploy to Production ⏱️ 2 hours

```bash
cd Backend
railway login
railway link
railway up
```

**Verify:**
- API endpoints responding
- Swagger docs at `/api/docs`
- Health check passing
- Database accessible
- Logs clean (no errors)

---

### G4: Create Demo Account ⏱️ 30 min

- Email: demo@example.com
- Password: DemoPass123!
- Pre-loaded with sample data
- Real Shopify store connected
- Real Exotel account setup

---

### G5: Financial Projections ⏱️ 1.5 hours

**Create 3-year forecast:**
```
Year 1: 10 paying customers @ ₹30,000/month = ₹3.6L ARR
Year 2: 100 customers @ ₹30,000/month = ₹3.6Cr ARR  
Year 3: 500 customers @ ₹30,000/month = ₹18Cr ARR
```

---

## ✅ SUCCESS CRITERIA

### **Product is Sellable When:**
- ✅ Complete E2E flow works (register→call→recording→billing)
- ✅ No dummy/mock data in dashboard
- ✅ Real Shopify & Exotel integration
- ✅ All 14 agents tested and working
- ✅ Error handling in place
- ✅ Monitoring & alerts set up
- ✅ Database backups automated
- ✅ Legal docs (ToS, Privacy Policy) created
- ✅ Customer support system ready
- ✅ 3 beta customers using it
- ✅ Live demo works flawlessly
- ✅ Production deployment verified
- ✅ Pitch deck ready
- ✅ Financial projections calculated

### **Then You Can:**
- ✅ Pitch to investors with confidence
- ✅ Onboard paid customers
- ✅ Scale with support system in place
- ✅ Close enterprise deals

---

## 📊 TIMELINE SUMMARY

```
Days 1-3:   Critical blockers (A1-A7)
Days 4-6:   Business logic (B1-B7)
Days 7-8:   Data integrity (C1-C5)
Days 9-10:  Production hardening (D1-D5)
Days 11-12: Customer experience (E1-E6)
Days 13-14: Testing & validation (F1-F4)
Days 15-16: Pitch ready (G1-G5)

TOTAL: 16 DAYS = 2.3 WEEKS
```

---

## 🎯 FINAL RESULT

**When complete, you'll have:**
✅ Real, working AI voice support platform
✅ No mock data
✅ No untested integrations
✅ Production-grade code
✅ Revenue model proven
✅ Beta customers validating product
✅ Professional pitch deck
✅ Ready for Series A funding round

---

**Start TODAY. Complete by December 9, 2025.**

**Then you can confidently say: "Caly is a proven, scalable, revenue-generating AI voice support platform."**

