#!/bin/bash
# ONE-COMMAND: Deploy Server + Build APK
# Run this tomorrow morning. That's it.

set -e

echo "🚀 ActionVault: Deploy Server + Build APK"
echo "=========================================="
echo ""
echo "This will:"
echo "1. Deploy your backend to Railway (global, 24/7)"
echo "2. Build your APK with production URL"
echo "3. Everything ready to download and install"
echo ""
read -p "Press Enter to start, or Ctrl+C to cancel..."
echo ""

PROJECT_DIR="/Users/eyal.abman/url origenizer"
cd "$PROJECT_DIR"

# ============ STEP 1: Deploy Backend to Railway ============
echo "📦 STEP 1: Deploying backend to Railway (free tier)"
echo ""

if ! command -v railway &> /dev/null; then
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

echo "Logging into Railway..."
railway login

echo ""
echo "Deploying your API server..."
cd "$PROJECT_DIR"
railway init
railway link
railway up

echo ""
echo "✅ Server deployed! Getting your production URL..."
sleep 5

# Get the production URL
PROD_URL=$(railway env | grep RAILWAY_PUBLIC_DOMAIN | cut -d'=' -f2 || echo "https://your-api.railway.app")

echo "✅ Your API is now live at: $PROD_URL"
echo ""

# ============ STEP 2: Build APK ============
echo "📱 STEP 2: Building APK with production URL"
echo ""

cd "$PROJECT_DIR/apps/mobile"

# Update .env with production URL
echo "Updating mobile app to use production server..."
sed -i '' "s|EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=$PROD_URL|g" .env

echo "Updated .env:"
grep EXPO_PUBLIC_API_URL .env

echo ""
echo "Building APK..."
echo "This takes 5-10 minutes..."

if ! npm list -g eas-cli &> /dev/null; then
    echo "Installing EAS CLI..."
    npm install -g eas-cli
fi

echo ""
echo "Starting EAS build (free tier)..."
eas login
eas build --platform android --local

echo ""
echo "✅ BUILD COMPLETE!"
echo ""
echo "Your APK is ready in: dist/"
echo ""
echo "🎉 Your app now:"
echo "   ✓ Connects to: $PROD_URL (globally, 24/7)"
echo "   ✓ Works EVERYWHERE - phone, travel, anywhere with internet"
echo "   ✓ Your laptop doesn't need to be on"
echo ""
echo "📥 Download APK from dist/ and install on your Android phone"
echo ""
