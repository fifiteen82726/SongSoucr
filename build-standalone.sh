#!/bin/bash

echo "🚀 Building Standalone Tidal Downloader for macOS"
echo "================================================="

# Function to log messages
log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

# Check if we're in the right directory
if [ ! -f "tidal_downloader.py" ]; then
    echo "❌ Please run this script from the tidalDownloader directory"
    exit 1
fi

# Check prerequisites
log "🔍 Checking prerequisites..."

if ! command -v python3 >/dev/null 2>&1; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js is required but not installed"  
    exit 1
fi

# Install PyInstaller if not present
log "📦 Installing PyInstaller..."
pip3 install pyinstaller

# Create standalone Python executable
log "🐍 Creating standalone Python executable..."

pyinstaller --onefile \
    --name "tidal-downloader-backend" \
    --add-data "tidal_downloader.py:." \
    --hidden-import requests \
    --hidden-import urllib3 \
    --hidden-import json \
    --hidden-import pathlib \
    --clean \
    tidal_downloader.py

if [ ! -f "dist/tidal-downloader-backend" ]; then
    echo "❌ Failed to create Python executable"
    exit 1
fi

log "✅ Python executable created: dist/tidal-downloader-backend"

# Build Electron app
cd tidal-electron-app

log "📦 Installing Node.js dependencies..."
yarn install

log "🏗️  Building React frontend..."
yarn build

# Update main.js to use the standalone executable
log "⚙️  Updating Electron to use standalone Python executable..."

# Create backup
cp electron/main.js electron/main.js.backup

# Update main.js to use the standalone executable
cat > electron/main-standalone.js << 'EOF'
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const https = require('https');
const cheerio = require('cheerio');

// Get the correct executable path
function getTidalDownloaderPath() {
  if (isDev) {
    // In development, use python3 with the script
    return 'python3';
  } else {
    // In production, use the bundled executable
    return path.join(process.resourcesPath, 'tidal-downloader-backend');
  }
}

function getTidalDownloaderArgs(url, options = {}) {
  if (isDev) {
    // In development, include the script path as first argument
    return [path.join(__dirname, '../../tidal_downloader.py'), url, ...Object.entries(options).flat()];
  } else {
    // In production, the executable doesn't need the script path
    return [url, ...Object.entries(options).flat()];
  }
}
EOF

# Append the rest of main.js content, updating spawn calls
tail -n +8 electron/main.js | sed 's/spawn('\''python3'\''/spawn(getTidalDownloaderPath())/g' | sed 's/\[pythonScriptPath,/getTidalDownloaderArgs(/g' >> electron/main-standalone.js

# Replace main.js
mv electron/main-standalone.js electron/main.js

# Update package.json to include the executable
log "📝 Updating package.json..."

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Add the executable to extraResources
pkg.build.extraResources = pkg.build.extraResources || [];
pkg.build.extraResources.push({
  from: '../dist/tidal-downloader-backend',
  to: 'tidal-downloader-backend'
});

// Update files to exclude Python script (now using executable)
pkg.build.files = pkg.build.files.filter(file => file !== '../tidal_downloader.py');

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Updated package.json');
"

log "🍎 Building macOS app..."
yarn dmg

# Restore original main.js
mv electron/main.js.backup electron/main.js

# Check if build succeeded
if [ -f "dist/"*".dmg" ]; then
    log "🎉 SUCCESS! Standalone macOS app created!"
    echo ""
    echo "📁 Build Output:"
    ls -la dist/
    echo ""
    echo "📋 What's Included:"
    echo "✅ Electron frontend (React app)"
    echo "✅ Standalone Python backend (no Python installation required)"
    echo "✅ All Python dependencies bundled"
    echo "✅ Queue/download management system"
    echo ""
    echo "⚠️  Still Required on User's Mac:"
    echo "❗ FFmpeg (for MP3 conversion): brew install ffmpeg"
    echo ""
    echo "🔐 Installation:"
    echo "1. Mount the DMG file"
    echo "2. Drag app to Applications"
    echo "3. Right-click → Open (first time only, due to no code signing)"
    echo "4. Install FFmpeg if not present"
    echo ""
    echo "🎯 The app is now completely standalone except for FFmpeg!"
    
else
    log "❌ Build failed. Check output above for errors."
    cd ..
    mv electron/main.js.backup electron/main.js 2>/dev/null || true
    exit 1
fi

cd ..
log "✅ Build completed successfully!"