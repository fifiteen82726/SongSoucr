#!/bin/bash

echo "🚀 Building Completely Standalone Tidal Downloader"
echo "================================================="
echo "This will bundle:"
echo "✅ Python runtime + dependencies"
echo "✅ FFmpeg binary"
echo "✅ Electron app"
echo "❌ No external dependencies required!"
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

# Check prerequisites for building
log "🔍 Checking build prerequisites..."

if ! command -v python3 >/dev/null 2>&1; then
    echo "❌ Python 3 is required for building (but won't be required for users)"
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js is required for building"
    exit 1
fi

# Install PyInstaller if not present
log "📦 Installing PyInstaller..."
pip3 install pyinstaller requests

# Create build directory
BUILD_DIR="$(pwd)/standalone-build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Step 1: Create standalone Python executable
log "🐍 Creating standalone Python executable..."

# Create a requirements file for PyInstaller
cat > requirements.txt << EOF
requests>=2.25.0
urllib3>=1.26.0
EOF

# Install requirements
pip3 install -r requirements.txt

# Create PyInstaller spec file for better control
cat > tidal_downloader.spec << 'EOF'
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['tidal_downloader.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['requests', 'urllib3', 'json', 'pathlib', 'subprocess', 'os', 'shutil', 'zipfile', 'logging'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='tidal-downloader',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
EOF

# Build with PyInstaller
pyinstaller tidal_downloader.spec --clean --onefile --distpath "$BUILD_DIR"

if [ ! -f "$BUILD_DIR/tidal-downloader" ]; then
    echo "❌ Failed to create Python executable"
    exit 1
fi

log "✅ Python executable created: $BUILD_DIR/tidal-downloader"

# Step 2: Download and bundle FFmpeg
log "📥 Downloading FFmpeg binary..."

# Download FFmpeg static build for macOS
FFMPEG_URL="https://evermeet.cx/ffmpeg/ffmpeg-6.0.zip"
FFMPEG_ZIP="$BUILD_DIR/ffmpeg.zip"

curl -L "$FFMPEG_URL" -o "$FFMPEG_ZIP"

if [ ! -f "$FFMPEG_ZIP" ]; then
    echo "❌ Failed to download FFmpeg"
    exit 1
fi

# Extract FFmpeg
cd "$BUILD_DIR"
unzip -q ffmpeg.zip
rm ffmpeg.zip

if [ ! -f "$BUILD_DIR/ffmpeg" ]; then
    echo "❌ Failed to extract FFmpeg"
    exit 1
fi

chmod +x "$BUILD_DIR/ffmpeg"
log "✅ FFmpeg binary ready: $BUILD_DIR/ffmpeg"

cd ..

# Step 3: Update Electron app for standalone mode
log "⚙️  Updating Electron app for standalone mode..."

cd tidal-electron-app

# Create backup of main.js
cp electron/main.js electron/main.js.original

# Create new main.js for standalone mode
cat > electron/main-standalone.js << 'EOF'
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const https = require('https');
const cheerio = require('cheerio');

// Get paths for bundled executables
function getBundledPaths() {
  if (isDev) {
    return {
      tidalDownloader: 'python3',
      tidalScript: path.join(__dirname, '../../tidal_downloader.py'),
      ffmpeg: 'ffmpeg'
    };
  } else {
    const resourcesPath = process.resourcesPath;
    return {
      tidalDownloader: path.join(resourcesPath, 'binaries', 'tidal-downloader'),
      tidalScript: null, // Not needed for standalone executable
      ffmpeg: path.join(resourcesPath, 'binaries', 'ffmpeg')
    };
  }
}

// Set FFmpeg path for the Python executable
function setFFmpegEnvironment() {
  const paths = getBundledPaths();
  if (!isDev) {
    // Add bundled FFmpeg to PATH
    const ffmpegDir = path.dirname(paths.ffmpeg);
    process.env.PATH = `${ffmpegDir}:${process.env.PATH}`;
  }
}

// Initialize FFmpeg environment
setFFmpegEnvironment();
EOF

# Append the rest of the original main.js, but modify the spawn calls
tail -n +8 electron/main.js | sed 's/python3/getBundledPaths().tidalDownloader/g' | sed 's/pythonScriptPath,/...getBundledPaths().tidalScript ? [getBundledPaths().tidalScript] : [],/g' >> electron/main-standalone.js

# Use the standalone version
mv electron/main-standalone.js electron/main.js

# Step 4: Update package.json
log "📝 Updating package.json for standalone bundle..."

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Update extraResources to include binaries
pkg.build.extraResources = [
  {
    from: '../standalone-build/tidal-downloader',
    to: 'binaries/tidal-downloader'
  },
  {
    from: '../standalone-build/ffmpeg',
    to: 'binaries/ffmpeg'
  }
];

// Add author to avoid warning
pkg.author = 'Tidal Downloader Team';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Updated package.json for standalone build');
"

# Step 5: Build the app
log "📦 Installing Node.js dependencies..."
npm install

log "🏗️  Building React app..."
npm run build

log "🍎 Building standalone macOS app..."
npm run dmg

# Restore original main.js
mv electron/main.js.original electron/main.js

# Check results
if [ -f "dist/"*".dmg" ]; then
    log "🎉 SUCCESS! Completely standalone macOS app created!"
    echo ""
    echo "📁 Build Output:"
    ls -la dist/*.dmg
    echo ""
    echo "📊 File Sizes:"
    du -h dist/*.dmg
    echo ""
    echo "🎯 WHAT'S INCLUDED (NO EXTERNAL DEPENDENCIES):"
    echo "✅ Electron frontend (React app)"
    echo "✅ Python runtime + all dependencies (PyInstaller bundle)"
    echo "✅ FFmpeg binary for MP3 conversion"
    echo "✅ Complete queue/download system"
    echo ""
    echo "❌ ZERO USER REQUIREMENTS:"
    echo "🚫 No Python installation needed"
    echo "🚫 No pip install needed"
    echo "🚫 No FFmpeg installation needed"
    echo "🚫 No external dependencies at all!"
    echo ""
    echo "🔐 Installation (Users):"
    echo "1. Mount DMG file"
    echo "2. Drag app to Applications"
    echo "3. Right-click → Open (first time only)"
    echo "4. That's it! Everything is bundled."
    echo ""
    echo "📦 App is completely self-contained!"
    
else
    log "❌ Build failed. Check output above for errors."
    cd ..
    mv electron/main.js.original electron/main.js 2>/dev/null || true
    exit 1
fi

cd ..

# Cleanup
log "🧽 Cleaning up build files..."
rm -rf "$BUILD_DIR" requirements.txt tidal_downloader.spec

log "✅ Standalone build completed successfully!"
echo ""
echo "🚀 Your app is now COMPLETELY STANDALONE!"
echo "📧 Users can install and run without any technical requirements!"