#!/bin/bash
echo "🎵 TorMusic Setup"
echo "=================="

# Check node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org"
  exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm not found."
  exit 1
fi

echo "✅ Node $(node --version) found"

# Install deps
echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Done! Run the app with:"
echo ""
echo "  npx expo start"
echo ""
echo "Then scan the QR code with Expo Go on your iPhone."
echo ""
echo "📱 Get Expo Go: https://apps.apple.com/app/expo-go/id982107779"
