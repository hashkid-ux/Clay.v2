// IMPLEMENTATION SUMMARY - Client Credentials Onboarding

## ✅ What Was Implemented

### Frontend Changes:
1. **OnboardingPage.jsx** - Updated to:
   - Collect Shopify credentials (Store URL, API Key, API Secret)
   - Collect Exotel credentials (Phone Number, SID, Token)
   - Add "Test Connection" buttons before submission
   - Call real API endpoints instead of dummy updates
   - Show validation errors with helpful messages

### Backend Changes:
1. **routes/onboarding.js** - Created with:
   - `POST /api/onboarding/complete` - Main onboarding endpoint
   - `POST /api/onboarding/test-shopify` - Test Shopify credentials
   - `POST /api/onboarding/test-exotel` - Test Exotel credentials
   - `GET /api/onboarding/status` - Check onboarding status
   - AES-256 encryption for sensitive data (API secrets, tokens)
   - Validation of credentials against real APIs

2. **server.js** - Added:
   - Route handler for `/api/onboarding` (protected by authMiddleware)

3. **.env.example** - Updated to:
   - Remove client-specific keys (SHOPIFY_API_KEY, EXOTEL_SID, EXOTEL_TOKEN)
   - Add ENCRYPTION_KEY for encrypting stored secrets
   - Add comments explaining client credentials come from onboarding

4. **Database Migration** - `001_add_onboarding_fields.sql`:
   - Added 15 new columns to clients table
   - Encrypted storage for shopify_api_secret and exotel_token
   - Configuration flags (is_configured, onboarding_completed_at)
   - Business rule settings (return_window_days, escalation_threshold, etc.)
   - Feature toggles (enable_whatsapp, enable_sms, enable_email)

## 🔐 Data Flow

```
Client (Store Owner)
   ↓
1. Registers on Caly
2. Goes to Onboarding
3. Gets Shopify credentials from their store admin
4. Enters credentials in onboarding form
5. Clicks "Test Shopify Connection"
   ↓
Frontend
   ↓
   POST /api/onboarding/test-shopify
   {
     shopifyStore: "mystore.myshopify.com",
     shopifyApiKey: "shpca_abc123...",
     shopifyApiSecret: "shpat_xyz789..."
   }
   ↓
Backend
   ↓
1. Receives credentials
2. Makes API call to https://mystore.myshopify.com/admin/api/...
3. If valid: Returns { success: true }
4. If invalid: Returns { error: "Invalid credentials" }
   ↓
Frontend
   ↓
Shows "✓ Shopify Connected" or error message
   ↓
Client clicks "Complete Setup"
   ↓
Frontend
   ↓
   POST /api/onboarding/complete
   {
     shopifyStore: "mystore.myshopify.com",
     shopifyApiKey: "shpca_abc123...",
     shopifyApiSecret: "shpat_xyz789...",
     exotelNumber: "+919876543210",
     exotelSid: "sid123",
     exotelToken: "token123",
     ... (business rules)
   }
   ↓
Backend
   ↓
1. Validates Shopify & Exotel credentials again
2. Encrypts secrets: encrypt(shopifyApiSecret) → "encrypted-hash"
3. Stores in database:
   clients table:
   ├─ shopify_store: "mystore.myshopify.com"
   ├─ shopify_api_key: "shpca_abc123..." (NOT encrypted, safe to read)
   ├─ shopify_api_secret_encrypted: "encrypted-hash" (encrypted!)
   ├─ exotel_sid: "sid123"
   ├─ exotel_token_encrypted: "encrypted-hash" (encrypted!)
   ├─ is_configured: true
   └─ onboarding_completed_at: NOW()
   ↓
Frontend
   ↓
Redirects to /dashboard
   ↓
Ready to handle calls!
```

## 🔑 Environment Variables Needed

### Backend .env (YOUR config):
```env
# Encryption for storing client secrets
ENCRYPTION_KEY=your_random_32_char_key_CHANGE_IN_PRODUCTION

# OpenAI (your API)
OPENAI_API_KEY=sk-your-key

# Email (for OTP)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password

# JWT (your secret)
JWT_SECRET=your-random-32-char-key
```

### NOT in .env (comes from clients):
```
❌ SHOPIFY_API_KEY - Client provides
❌ SHOPIFY_API_SECRET - Client provides
❌ EXOTEL_SID - Client provides
❌ EXOTEL_TOKEN - Client provides
```

## 🗄️ Database Setup

Run migration to add fields:
```bash
cd Backend
node scripts/run-migrations.js
```

Or manually run SQL:
```sql
ALTER TABLE clients ADD COLUMN shopify_store VARCHAR(255);
ALTER TABLE clients ADD COLUMN shopify_api_key VARCHAR(255);
ALTER TABLE clients ADD COLUMN shopify_api_secret_encrypted TEXT;
ALTER TABLE clients ADD COLUMN exotel_sid VARCHAR(255);
ALTER TABLE clients ADD COLUMN exotel_number VARCHAR(20);
ALTER TABLE clients ADD COLUMN exotel_token_encrypted TEXT;
ALTER TABLE clients ADD COLUMN return_window_days INTEGER DEFAULT 14;
ALTER TABLE clients ADD COLUMN refund_auto_threshold NUMERIC(10,2) DEFAULT 2000;
ALTER TABLE clients ADD COLUMN cancel_window_hours INTEGER DEFAULT 24;
ALTER TABLE clients ADD COLUMN escalation_threshold INTEGER DEFAULT 60;
ALTER TABLE clients ADD COLUMN enable_whatsapp BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN enable_sms BOOLEAN DEFAULT true;
ALTER TABLE clients ADD COLUMN enable_email BOOLEAN DEFAULT true;
ALTER TABLE clients ADD COLUMN is_configured BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN onboarding_completed_at TIMESTAMP;
```

## 🚀 Testing Locally

1. **Start Frontend:**
```bash
cd Frontend
npm start
```

2. **Start Backend:**
```bash
cd Backend
npm install
npm start
```

3. **Test Flow:**
   - Register new account
   - Go to Onboarding
   - Fill Step 1 (timezone, language)
   - Fill Step 2: 
     - Shopify Store: (test.myshopify.com)
     - API Key: (from test Shopify store)
     - API Secret: (from test Shopify store)
   - Click "Test Shopify Connection"
   - Fill Step 3:
     - Phone: +918001234567
     - Exotel SID: (your test SID)
     - Token: (your test token)
   - Click "Test Exotel Connection"
   - Fill Step 4 (business rules)
   - Click "Complete Setup"
   - Should redirect to Dashboard

## 🔒 Security Notes

1. **API Secrets are encrypted** using AES-256
2. **Passwords use bcrypt** (not plain text)
3. **JWT tokens** have 24h expiry
4. **Database queries** are parameterized (no SQL injection)
5. **Validation** happens on both frontend and backend
6. **HTTPS only** in production

## 🐛 Common Issues

### Issue: "Invalid Shopify credentials"
**Solution:** 
- Check store URL format (should be: store.myshopify.com)
- Verify API Key and Secret are correct in Shopify admin
- Ensure Custom App has required scopes

### Issue: "Invalid Exotel credentials"
**Solution:**
- Check SID is correct (case-sensitive)
- Verify API Token hasn't expired
- Check Exotel account is active

### Issue: Credentials not saving
**Solution:**
- Check ENCRYPTION_KEY is set in .env
- Check database migration ran successfully
- Check authMiddleware is working (should have token)

## 📝 Next Steps

1. Set ENCRYPTION_KEY in Railway dashboard
2. Run database migration
3. Deploy to Railway + Vercel
4. Test end-to-end

Questions? Ask me! 🚀
