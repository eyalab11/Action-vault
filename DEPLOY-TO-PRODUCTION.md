# Deploy ActionVault Backend to Production (FREE)

Run this in the morning to make your app work EVERYWHERE globally.

## Option 1: Railway.app (Easiest - Recommended)

Railway provides **free tier** with persistent API hosting. Your app will work globally.

### Step 1: Deploy Backend (5 minutes)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login (creates free account)
railway login

# Go to your project
cd /Users/eyal.abman/url\ origenizer

# Deploy
railway init
railway link
railway up
```

### Step 2: Get Your Production URL
```bash
railway env
# Look for: RAILWAY_PUBLIC_DOMAIN or your API URL
# Copy this URL - you'll need it next
```

### Step 3: Update Mobile App
```bash
cd apps/mobile

# Edit .env
# Change: EXPO_PUBLIC_API_URL=https://your-railway-url.railway.app

# Build APK with production URL
npm install -g eas-cli
eas build --platform android
```

## Option 2: Render.com (Also Free)

1. Go to https://render.com
2. Connect GitHub repo
3. Create web service
4. Deploy (free tier available)
5. Get live URL
6. Update app .env
7. Build APK

## Option 3: Replit (Simplest for Learning)

1. Go to https://replit.com
2. Import from GitHub
3. "Run" 
4. Get live URL from Replit
5. Update app
6. Build APK

## AFTER DEPLOYMENT

Once your server is live on Railway/Render/Replit:
- Your API runs 24/7 globally
- Your phone app connects to THAT URL (not your computer)
- App works EVERYWHERE - coffee shops, travel, anywhere with internet
- Your laptop can be off - app still works

## Key Files Updated

After deployment, your app config will be:
```
EXPO_PUBLIC_API_URL=https://actionvault-api.railway.app
EXPO_PUBLIC_SUPABASE_URL=https://cevpsrydlowwpasnpgwc.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key
```

Then build APK with:
```bash
cd apps/mobile
eas build --platform android --local
```

Done! APK works everywhere.
