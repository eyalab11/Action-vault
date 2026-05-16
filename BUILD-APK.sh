#!/bin/bash
# ActionVault APK Builder Script - Run Tomorrow Morning!

set -e

echo "🚀 ActionVault APK Builder"
echo "=========================="
echo ""
echo "Your API server is already running!"
echo ""

cd apps/mobile

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "Choose your build method:"
echo ""
echo "1) EAS Build (Cloud - Easiest & Fastest)"
echo "   - Creates production APK in 5-10 min"
echo "   - Free tier available at eas.expo.dev"
echo ""
echo "2) Local Gradle Build (Full Control)"
echo "   - Requires Android Studio SDK"
echo "   - Runs entirely on your machine"
echo ""
echo "3) Expo Go (Instant Testing)"
echo "   - Run on phone immediately over WiFi"
echo "   - No build time, great for testing"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "Installing EAS CLI..."
        npm install -g eas-cli
        echo ""
        echo "Starting EAS Build..."
        echo "You'll need to sign up at eas.expo.dev (free)"
        eas build --platform android --local
        echo ""
        echo "✅ APK is ready in dist/ folder"
        echo "📱 Download and install on your Android phone"
        ;;
    2)
        echo ""
        echo "Running Expo Prebuild (generates Android project)..."
        npx expo prebuild --clean
        echo ""
        cd android
        echo "Building APK with Gradle..."
        ./gradlew assembleRelease
        echo ""
        echo "✅ APK created at:"
        echo "   android/app/build/outputs/apk/release/app-release.apk"
        echo "📱 Download and install on your Android phone"
        ;;
    3)
        echo ""
        echo "Starting Expo development server..."
        echo "Scan the QR code with Expo Go app on your phone"
        npx expo start
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
