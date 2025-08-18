#!/bin/bash

echo "🚀 Building COMPLETELY STANDALONE Tidal Downloader"
echo "=================================================="
echo ""
echo "This creates a macOS app with ZERO user requirements:"
echo "✅ Python runtime bundled"
echo "✅ All Python dependencies included"
echo "✅ FFmpeg binary bundled"
echo "✅ No external installations needed"
echo ""

# Function to log messages
log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

# Check if we're in the right directory
if [ ! -f "tidal_downloader.py" ]; then
    echo "❌ Please run this script from the tidalDownloader directory"
    exit 1
fi

log "🏗️  Creating standalone Python executable..."
if [ ! -f "binaries/tidal-downloader" ]; then
    log "Creating PyInstaller executable..."
    pip3 install pyinstaller requests
    pyinstaller --onefile --name "tidal-downloader" tidal_downloader.py
    mkdir -p binaries
    cp dist/tidal-downloader binaries/
    rm -rf build dist *.spec
else
    log "✅ Python executable already exists"
fi

log "📥 Downloading FFmpeg binary..."
mkdir -p binaries
if [ ! -f "binaries/ffmpeg" ]; then
    log "Downloading FFmpeg from evermeet.cx..."
    curl -L "https://evermeet.cx/ffmpeg/ffmpeg-6.0.zip" -o /tmp/ffmpeg.zip
    cd /tmp && unzip -q ffmpeg.zip
    cp ffmpeg "$(dirname "$0")/binaries/"
    rm ffmpeg.zip ffmpeg
    cd "$(dirname "$0")"
    log "✅ FFmpeg downloaded and ready"
else
    log "✅ FFmpeg binary already exists"
fi

log "🔧 Building Electron app..."
cd tidal-electron-app

# Build React app
yarn install
yarn build

# Build macOS DMG
yarn dmg

cd ..

if [ -f "tidal-electron-app/dist/"*".dmg" ]; then
    log "🎉 SUCCESS! Standalone app built!"
    echo ""
    echo "📁 Output Location:"
    ls -la tidal-electron-app/dist/*.dmg
    echo ""
    echo "📊 Final Size:"
    du -h tidal-electron-app/dist/*.dmg
    echo ""
    echo "🎯 WHAT USERS GET:"
    echo "━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Complete Tidal Downloader app"
    echo "✅ Queue management system"
    echo "✅ 320kbps MP3 conversion"
    echo "✅ Metadata extraction"
    echo "✅ Progress tracking"
    echo ""
    echo "❌ ZERO REQUIREMENTS:"
    echo "🚫 No Python needed"
    echo "🚫 No pip installs needed" 
    echo "🚫 No FFmpeg needed"
    echo "🚫 No technical setup required"
    echo ""
    echo "📧 Users just:"
    echo "1. Download DMG"
    echo "2. Drag to Applications"
    echo "3. Open and use!"
    echo ""
    echo "🚀 Perfect for non-technical users!"
else
    log "❌ Build failed!"
    exit 1
fi