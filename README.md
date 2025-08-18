# Tidal Downloader

A professional macOS application for downloading music from Tidal with queue management, metadata extraction, and automatic MP3 conversion.

## Features

- ✅ **Queue Management**: Add multiple songs to download queue
- ✅ **Metadata Extraction**: Automatically fetches song title and artist
- ✅ **Format Conversion**: Downloads FLAC and converts to 320kbps MP3
- ✅ **Progress Tracking**: Real-time download progress monitoring
- ✅ **URL Cleaning**: Removes tracking parameters automatically
- ✅ **Retry/Cancel**: Full control over failed downloads
- ✅ **Standalone**: No external dependencies required

## Quick Start (Users)

1. **Download**: Get the appropriate DMG file for your Mac
   - `Tidal Downloader-1.0.0.dmg` (Intel Macs)
   - `Tidal Downloader-1.0.0-arm64.dmg` (Apple Silicon)

2. **Install**: 
   - Double-click DMG to mount
   - Drag "Tidal Downloader" to Applications folder

3. **First Launch**:
   - Right-click app → "Open" (bypasses security warning)
   - Subsequent launches: normal double-click

4. **Usage**:
   - Paste Tidal song URL
   - Click "Add to Queue" 
   - Watch download progress
   - Find MP3 files in `~/Desktop/DJ/`

## Development Setup

### Prerequisites (Development Only)
- Node.js and npm
- Python 3 with pip
- Git

### Installation
```bash
git clone <repository-url>
cd tidalDownloader
```

## Building the App

### 🚀 Complete Standalone Build (Recommended)
Creates a fully self-contained app with zero user requirements:

```bash
./build-final.sh
```

**What this does:**
- Creates standalone Python executable (PyInstaller)
- Downloads and bundles FFmpeg binary
- Builds React frontend
- Packages everything into macOS DMG
- Results in 144MB app with zero dependencies

### 🏗️ Development Build
For testing during development:

```bash
cd tidal-electron-app
npm install
npm run build
npm run dmg
```

### 📦 Alternative Build Scripts

```bash
# Quick backend-only test
./build-simple.sh           # Requires Python/FFmpeg on user's Mac

# Full standalone with custom options  
./build-standalone-complete.sh   # Advanced standalone build
```

## Testing the App

### 🧪 Comprehensive Test Suite

```bash
# Test everything (backend + frontend + integration)
./test-everything.sh

# Test UI with manual interaction (30 second window)
./test-ui.sh

# Test backend Python script only
./test.sh

# Test standalone app components
./test-standalone.sh
```

### 🎯 Manual Testing Steps

1. **Launch Test**:
   ```bash
   ./test-everything.sh
   ```

2. **UI Testing**:
   - When prompted, paste: `https://tidal.com/browse/track/431665151?u`
   - Click "Add to Queue"
   - Monitor download progress
   - Check for MP3 file in output directory

3. **Verify Components**:
   ```bash
   ./test-standalone.sh  # Verify all binaries work
   ```

### 📊 Test Output Example
```
🎯 Starting Full Stack Test...
🐍 Backend Direct Test: ✅ PASS
🔄 Frontend Integration: ✅ PASS  
📥 Download Started: ✅ YES
🔄 Conversion Detected: ✅ YES
✅ Completed Successfully: ✅ YES

🎯 OVERALL RESULT: ✅ FULL STACK WORKING
```

## Development Workflow

### 🔄 Regular Development
```bash
# Start development environment
cd tidal-electron-app
npm run electron-dev

# Run tests after changes
./test-everything.sh

# Build for distribution
./build-final.sh
```

### 🐛 Debugging
- **Logs**: Check `/tmp/tidal_downloader.log` for Python backend logs
- **Electron DevTools**: Available in development mode
- **Test Scripts**: Use individual test scripts to isolate issues

### 📝 Making Changes

1. **Frontend**: Edit files in `tidal-electron-app/src/`
2. **Backend**: Edit `tidal_downloader.py`
3. **Electron**: Edit files in `tidal-electron-app/electron/`
4. **Test**: Run `./test-everything.sh`
5. **Build**: Run `./build-final.sh`

## Architecture

### 📁 Project Structure
```
tidalDownloader/
├── tidal_downloader.py          # Python backend script
├── binaries/                    # Standalone executables
│   ├── tidal-downloader         # PyInstaller executable
│   └── ffmpeg                   # FFmpeg binary
├── tidal-electron-app/          # Electron app
│   ├── src/                     # React frontend
│   ├── electron/                # Electron main process
│   ├── build/                   # Built React app
│   └── dist/                    # Final app packages
├── test-*.sh                    # Test scripts
└── build-*.sh                   # Build scripts
```

### 🔄 Data Flow
1. **User Input** → React Frontend
2. **IPC Communication** → Electron Main Process  
3. **Process Spawn** → Python Backend/FFmpeg
4. **File Output** → User's Desktop/DJ folder
5. **Progress Updates** → Real-time UI feedback

## Command Line Usage (Alternative)

The Python script can also be used directly:

```bash
# Basic download (FLAC format, auto-extract)
python3 tidal_downloader.py "https://tidal.com/browse/track/440500111?u"

# Download and convert to 320kbps MP3
python3 tidal_downloader.py "https://tidal.com/browse/track/440500111?u"

# Specify output directory
python3 tidal_downloader.py -o ~/Downloads "https://tidal.com/browse/track/440500111?u"
```

### Options
- `-f, --format`: Audio format (`ogg`, `mp3`, `flac`) - default: `flac`
- `-o, --output`: Output directory - default: current directory
- `--no-mp3`: Keep original format instead of converting to MP3
- `--no-extract`: Don't extract ZIP file (keep as ZIP)

## Troubleshooting

### Common Issues

**Build Fails:**
```bash
# Clean and rebuild
rm -rf tidal-electron-app/dist tidal-electron-app/build
./build-final.sh
```

**Tests Fail:**
```bash
# Check dependencies
pip3 install requests pyinstaller
brew install ffmpeg  # For development only
```

**App Won't Launch:**
- Right-click → Open (first time only)
- Check Console.app for error messages
- Verify app isn't quarantined: `xattr -d com.apple.quarantine /path/to/app`

### 🔍 Debug Mode
```bash
# Run tests with verbose output
ELECTRON_ENABLE_LOGGING=1 ./test-everything.sh

# Check detailed logs
tail -f /tmp/tidal_downloader.log
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test: `./test-everything.sh`
4. Commit: `git commit -m "Add feature"`
5. Push and create Pull Request

## Release Process

1. **Test**: `./test-everything.sh`
2. **Build**: `./build-final.sh`
3. **Verify**: `./test-standalone.sh`
4. **Distribute**: Upload DMG files

## Support

- **Issues**: Create GitHub issue with test output
- **Logs**: Include `/tmp/tidal_downloader.log` for backend issues
- **System**: Include macOS version and architecture

---

**🎵 Happy downloading!**