#!/bin/bash

echo "🍎 Building Standalone macOS App for Tidal Downloader"
echo "===================================================="

# Set up variables
APP_NAME="Tidal Downloader"
PYTHON_VERSION="3.11"
BUILD_DIR="$(pwd)/mac-app-build"
PYTHON_FRAMEWORK_DIR="$BUILD_DIR/python-framework"

# Function to log messages
log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
log "🔍 Checking prerequisites..."

if ! command_exists python3; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

if ! command_exists node; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

if ! command_exists pip3; then
    echo "❌ pip3 is required but not installed"
    exit 1
fi

# Check Python dependencies
log "🐍 Checking Python dependencies..."
python3 -c "import requests, pathlib" 2>/dev/null || {
    echo "❌ Missing Python dependencies. Installing..."
    pip3 install requests
}

# Navigate to app directory
cd "$(dirname "$0")/tidal-electron-app"

log "📦 Installing Node.js dependencies..."
yarn install

log "🏗️  Building React app..."
yarn build

log "🐍 Creating Python bundle..."

# Create build directory
mkdir -p "$BUILD_DIR"
mkdir -p "$PYTHON_FRAMEWORK_DIR"

# Option 1: Bundle Python with dependencies
log "📋 Creating Python bundle with dependencies..."

# Create a virtual environment for the app
python3 -m venv "$PYTHON_FRAMEWORK_DIR/python-env"
source "$PYTHON_FRAMEWORK_DIR/python-env/bin/activate"

# Install dependencies in the virtual environment
pip install requests

# Copy our Python script
cp "../tidal_downloader.py" "$PYTHON_FRAMEWORK_DIR/"

# Create a wrapper script that uses the bundled Python
cat > "$PYTHON_FRAMEWORK_DIR/run_tidal_downloader.sh" << 'EOF'
#!/bin/bash
# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Use the bundled Python environment
"$SCRIPT_DIR/python-env/bin/python" "$SCRIPT_DIR/tidal_downloader.py" "$@"
EOF

chmod +x "$PYTHON_FRAMEWORK_DIR/run_tidal_downloader.sh"

deactivate

log "⚙️  Updating Electron main.js for bundled Python..."

# Update main.js to use bundled Python
cp electron/main.js electron/main.js.backup

# Update the Python path in main.js
sed -i '' 's|python3|./python-framework/run_tidal_downloader.sh|g' electron/main.js

# Update the script path resolution
cat > electron/main-updated.js << 'EOF'
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const https = require('https');
const cheerio = require('cheerio');

// Get the correct Python script path
function getPythonScriptPath() {
  if (isDev) {
    return path.join(__dirname, '../../tidal_downloader.py');
  } else {
    // In production, use the bundled Python wrapper
    return path.join(process.resourcesPath, 'python-framework/run_tidal_downloader.sh');
  }
}

// Rest of the main.js content follows...
EOF

# Copy the rest of main.js content (excluding the path resolution part)
tail -n +20 electron/main.js >> electron/main-updated.js

# Replace the python3 calls in the file
sed -i '' 's|python3|getPythonScriptPath()|g' electron/main-updated.js

# Use the updated main.js
mv electron/main-updated.js electron/main.js

log "📦 Updating package.json for Python bundle..."

# Update package.json to include Python framework
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Add Python framework to extraResources
pkg.build.extraResources = pkg.build.extraResources || [];
pkg.build.extraResources.push({
  from: '../mac-app-build/python-framework',
  to: 'python-framework'
});

// Add ffmpeg requirement note
pkg.build.mac.category = 'public.app-category.music';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Updated package.json for Python bundle');
"

log "🍎 Building macOS DMG..."
yarn dmg

# Restore original main.js
mv electron/main.js.backup electron/main.js

if [ -f "dist/Tidal Downloader-*.dmg" ]; then
    log "🎉 SUCCESS! macOS app built successfully!"
    log "📁 DMG file location: $(pwd)/dist/"
    ls -la dist/*.dmg
    
    echo ""
    echo "📋 Installation Instructions:"
    echo "1. Double-click the DMG file to mount it"
    echo "2. Drag 'Tidal Downloader' to Applications folder"
    echo "3. Install ffmpeg: brew install ffmpeg (required for MP3 conversion)"
    echo "4. Launch the app from Applications"
    echo ""
    echo "⚠️  Important Notes:"
    echo "- App includes bundled Python and dependencies"
    echo "- FFmpeg must be installed separately for MP3 conversion"
    echo "- App is not code-signed (will show security warning)"
    echo ""
    echo "🔐 To bypass security warning:"
    echo "Right-click app → Open → Open anyway"
    
else
    log "❌ Build failed. Check output above for errors."
    exit 1
fi

# Clean up build directory
log "🧽 Cleaning up build files..."
rm -rf "$BUILD_DIR"

log "✅ Build process completed!"