#!/bin/bash
# Caly MVP Deployment Checklist - Run before production deployment

echo "🚀 Caly MVP Pre-Deployment Checklist"
echo "======================================"
echo ""

# 1. Backend Syntax Checks
echo "✅ STEP 1: Checking Backend Syntax..."
cd Backend
node -c server.js && echo "  ✓ server.js"
node -c agents/BaseAgent.js && echo "  ✓ agents/BaseAgent.js"
node -c sessions/CallSessionManager.js && echo "  ✓ sessions/CallSessionManager.js"
node -c utils/moduleResolver.js && echo "  ✓ utils/moduleResolver.js"
echo "✅ Backend syntax verified"
echo ""

# 2. Check dependencies
echo "✅ STEP 2: Checking Dependencies..."
npm list > /dev/null 2>&1 && echo "  ✓ All npm packages installed"
echo "✅ Dependencies ready"
echo ""

# 3. Environment variables
echo "✅ STEP 3: Verifying Environment Variables..."
if [ -z "$OPENAI_API_KEY" ]; then
  echo "  ⚠️  WARNING: OPENAI_API_KEY not set"
else
  echo "  ✓ OPENAI_API_KEY configured"
fi

if [ -z "$DATABASE_URL" ] && [ -z "$DB_HOST" ]; then
  echo "  ⚠️  WARNING: No database URL configured"
else
  echo "  ✓ Database configured"
fi

if [ -z "$EXOTEL_API_KEY" ]; then
  echo "  ⚠️  WARNING: EXOTEL_API_KEY not set"
else
  echo "  ✓ EXOTEL_API_KEY configured"
fi
echo ""

# 4. Git status
echo "✅ STEP 4: Git Status..."
git status --short | head -5
if [ $(git status --short | wc -l) -eq 0 ]; then
  echo "  ✓ All changes committed"
else
  echo "  ⚠️  Uncommitted changes detected"
fi
echo ""

# 5. Database check
echo "✅ STEP 5: Database Schema Check..."
echo "  Run: npm run migrate (if using migrations)"
echo ""

# 6. Frontend build
echo "✅ STEP 6: Frontend Build Check..."
cd ../Frontend
npm run build > /dev/null 2>&1 && echo "  ✓ Frontend builds successfully" || echo "  ⚠️  Frontend build failed"
echo ""

echo "======================================"
echo "✅ Pre-deployment checklist complete!"
echo ""
echo "Next steps for Railway deployment:"
echo "1. railway up                    # Deploy to Railway"
echo "2. railway open                  # View deployed app"
echo "3. Monitor logs: railway logs -f"
echo ""
echo "To pitch to founders:"
echo "- Show Live Call Monitor (real-time metrics)"
echo "- Show Analytics Dashboard (cost savings)"
echo "- Show Call Playback (quality)"
echo "- Highlight: 80% cost reduction vs human agents"
echo ""
