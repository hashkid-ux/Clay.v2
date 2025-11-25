// DEPLOYMENT CHECKLIST - Client Credentials Onboarding

## ✅ Files Created/Modified

### Created:
- ✅ Backend/routes/onboarding.js (170 lines)
- ✅ Backend/db/migrations/001_add_onboarding_fields.sql
- ✅ Backend/scripts/run-migrations.js
- ✅ IMPLEMENTATION_NOTES.md

### Modified:
- ✅ Frontend/src/pages/OnboardingPage.jsx
  - Added state for test results
  - Added testShopifyConnection() function
  - Added testExotelConnection() function
  - Added test buttons to UI
  - Updated handleSubmit to call /api/onboarding/complete

- ✅ Backend/server.js
  - Added route: app.use('/api/onboarding', authMiddleware, ...)

- ✅ Backend/.env.example
  - Removed: SHOPIFY_API_KEY, SHOPIFY_API_SECRET
  - Removed: EXOTEL_SID, EXOTEL_TOKEN
  - Added: ENCRYPTION_KEY
  - Added: Comments explaining client credentials

## 🔧 Before Deploying to Railway

### 1. Add Environment Variables
In Railway dashboard → Project Settings → Variables, add:

```
ENCRYPTION_KEY=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" in terminal>
OPENAI_API_KEY=sk-...
JWT_SECRET=<run same command above for 32-char random string>
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
```

### 2. Run Database Migration
```bash
cd Backend
node scripts/run-migrations.js
```

Or if using Railway CLI:
```bash
railway run node scripts/run-migrations.js
```

### 3. Test Locally First
```bash
# Terminal 1 - Backend
cd Backend
npm install
npm start

# Terminal 2 - Frontend
cd Frontend
npm install
npm start

# Then go to http://localhost:3000
# Register → Onboarding → Test all steps
```

## 🚀 Deployment Steps

### Step 1: Deploy Backend to Railway
```bash
cd Backend
railway up
```

### Step 2: Deploy Frontend to Vercel
```bash
cd Frontend
npm run build
vercel --prod
```

### Step 3: Update Frontend .env.production
In Frontend/.env.production:
```env
REACT_APP_API_URL=https://calybackend-production.up.railway.app
```

### Step 4: Redeploy Frontend with updated API URL
```bash
cd Frontend
vercel --prod
```

## ✅ Post-Deployment Checklist

- [ ] Backend server running on Railway
- [ ] Database migration completed
- [ ] ENCRYPTION_KEY set in Railway
- [ ] Frontend deployed to Vercel
- [ ] Can register new account
- [ ] Can reach onboarding page
- [ ] Test Shopify connection works (with real credentials)
- [ ] Test Exotel connection works (with real credentials)
- [ ] Can complete onboarding
- [ ] Data shows in database encrypted
- [ ] Redirects to dashboard after onboarding

## 🔍 Testing Production

1. **Register test account:**
   - Email: test@myshop.com
   - Password: Test@123
   - Company: Test Shop

2. **Go through onboarding:**
   - Step 1: Set timezone to Asia/Kolkata
   - Step 2: Enter your real Shopify test store credentials
   - Step 3: Enter your real Exotel test credentials
   - Step 4: Set business rules

3. **Verify in database:**
```sql
SELECT 
  id, 
  email,
  is_configured, 
  shopify_store,
  exotel_number,
  onboarding_completed_at
FROM clients 
WHERE email = 'test@myshop.com';
```

Should show:
- is_configured: true
- shopify_store: your-store.myshopify.com
- exotel_number: your-number
- onboarding_completed_at: current timestamp

## 🆘 Troubleshooting

### Error: "INSERT or UPDATE on table "clients" violates..."
**Fix:** Run migration again
```bash
node scripts/run-migrations.js
```

### Error: "ENCRYPTION_KEY is not defined"
**Fix:** Add to Railway environment variables
```
ENCRYPTION_KEY=abc123...xyz
```

### Error: "POST /api/onboarding/complete 401"
**Fix:** Token not being sent, check AuthContext is working
- Check localStorage has accessToken
- Check Authorization header is being sent

### Shopify test always fails
**Fix:** Check your credentials format
- Store URL should be: store.myshopify.com (no https://)
- API Key should be: shpca_xxxxx...
- API Secret should be: shpat_xxxxx...

### Exotel test always fails
**Fix:** Check credentials
- SID is case-sensitive
- Token should not have whitespace
- Account must be active in Exotel

## 📞 Getting Real Test Credentials

### Shopify:
1. Go to your-store.myshopify.com/admin
2. Apps → Develop apps → Create app
3. Configuration → Admin API access scopes
4. Enable these scopes:
   - read_orders, write_orders
   - read_products, write_products
5. Save and reveal → Copy API Key and Secret

### Exotel:
1. Login to exotel.com
2. Settings → API Keys
3. Copy SID and Auth Token
4. Use your registered phone number

## 🎯 Final Checklist

- [ ] Encryption working (secrets encrypted in DB)
- [ ] Test buttons show pass/fail correctly
- [ ] Can't proceed without passing tests
- [ ] Data persists in database
- [ ] Dashboard loads after onboarding
- [ ] Auth token refreshes work
- [ ] Multiple clients can register separately
- [ ] Each client sees only their data

Ready to deploy? Let me know! 🚀
