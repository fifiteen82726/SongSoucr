#!/bin/bash

echo "🍎 Building Tidal Downloader macOS App (Simple)"
echo "=============================================="

# Navigate to app directory
cd "$(dirname "$0")/tidal-electron-app"

echo "📦 Installing dependencies..."
yarn install

echo "🏗️  Building React app..."
yarn build

echo "🍎 Building macOS DMG..."
yarn dmg

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 SUCCESS! macOS app built!"
    echo "📁 Location: $(pwd)/dist/"
    ls -la dist/*.dmg 2>/dev/null || ls -la dist/
    echo ""
    echo "📋 What's Included:"
    echo "✅ Electron frontend (React app)"
    echo "✅ Python script (tidal_downloader.py)"
    echo "✅ Queue/download management"
    echo ""
    echo "⚠️  Requirements on User's Mac:"
    echo "❗ Python 3 with requests module: pip3 install requests"
    echo "❗ FFmpeg for conversion: brew install ffmpeg"
    echo ""
    echo "🔐 Installation:"
    echo "1. Double-click DMG to mount"
    echo "2. Drag app to Applications folder"
    echo "3. Right-click app → Open (first time only)"
    echo "4. Install Python deps and FFmpeg if needed"
else
    echo "❌ Build failed!"
    exit 1
fi