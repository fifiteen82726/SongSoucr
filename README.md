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
- Node.js and yarn (we use yarn for better performance and consistency)
- Python 3 with pip
- Git

**Note**: This project uses yarn exclusively for package management. If you don't have yarn:
```bash
npm install -g yarn
```

### Installation
```bash
git clone <repository-url>
cd tidalDownloader
```

## Building the App

### 🚀 Complete Standalone Build (Recommended)
**Use this for production releases and distribution**

```bash
./scripts/build-final.sh
```

**What it creates:**
- 144MB DMG with ZERO user dependencies
- Bundled Python runtime (7MB PyInstaller executable)  
- Bundled FFmpeg binary (75MB, downloaded during build)
- Works on any Mac without installations

**Best for:** Final releases, non-technical users, distribution

---

### 🏗️ Development Build
**Use this during active development**

```bash
cd tidal-electron-app
yarn install
yarn build
yarn dmg
```

**What it creates:**
- 112MB DMG (smaller, faster build)
- Includes Python script (not executable)
- Requires user to have Python 3 + FFmpeg installed

**Best for:** Development, testing changes, technical users

---

### 📦 Build Script Comparison

| Script | Size | User Requirements | Build Time | Use Case |
|--------|------|------------------|------------|----------|
| `./scripts/build-final.sh` | 144MB | **None** | ~3 min | **Production release** |
| `./scripts/build-simple.sh` | 112MB | Python + FFmpeg | ~1 min | Development/technical users |
| `./scripts/build-standalone-complete.sh` | 144MB | **None** | ~4 min | Advanced standalone options |
| `./scripts/build-mac-app.sh` | 144MB | **None** | ~4 min | Alternative packaging method |

**Quick Decision Guide:**
- 🎯 **Releasing to users?** → `./scripts/build-final.sh`
- 🔧 **Testing changes?** → `./scripts/build-simple.sh`
- 🛠️ **Development work?** → `yarn dmg`

## Testing the App

### 🧪 Comprehensive Test Suite

```bash
# Test everything (backend + frontend + integration)
./scripts/test-everything.sh

# Test UI with manual interaction (30 second window)
./scripts/test-ui.sh

# Test backend Python script only
./scripts/test.sh

# Test standalone app components
./scripts/test-standalone.sh
```

### 🎯 Manual Testing Steps

1. **Launch Test**:
   ```bash
   ./scripts/test-everything.sh
   ```

2. **UI Testing**:
   - When prompted, paste: `https://tidal.com/browse/track/431665151?u`
   - Click "Add to Queue"
   - Monitor download progress
   - Check for MP3 file in output directory

3. **Verify Components**:
   ```bash
   ./scripts/test-standalone.sh  # Verify all binaries work
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
yarn electron-dev

# Run tests after changes
./scripts/test-everything.sh

# Build for distribution
./scripts/build-final.sh
```

### 🐛 Debugging
- **Logs**: Check `/tmp/tidal_downloader.log` for Python backend logs
- **Electron DevTools**: Available in development mode
- **Test Scripts**: Use individual test scripts to isolate issues

### 📝 Making Changes

1. **Frontend**: Edit files in `tidal-electron-app/src/`
2. **Backend**: Edit `tidal_downloader.py`
3. **Electron**: Edit files in `tidal-electron-app/electron/`
4. **Test**: Run `./scripts/test-everything.sh`
5. **Build**: Run `./scripts/build-final.sh`

## Architecture

### 📁 Project Structure
```
tidalDownloader/
├── tidal_downloader.py          # Python backend script
├── binaries/                    # Standalone executables (created during build)
│   ├── tidal-downloader         # PyInstaller executable (built locally)
│   └── ffmpeg                   # FFmpeg binary (downloaded during build)
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
./scripts/build-final.sh
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
ELECTRON_ENABLE_LOGGING=1 ./scripts/test-everything.sh

# Check detailed logs
tail -f /tmp/tidal_downloader.log
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test: `./scripts/test-everything.sh`
4. Commit: `git commit -m "Add feature"`
5. Push and create Pull Request

## Release Process

1. **Test**: `./scripts/test-everything.sh`
2. **Build**: `./scripts/build-final.sh`
3. **Verify**: `./scripts/test-standalone.sh`
4. **Distribute**: Upload DMG files

## App Updates & Upgrades

### 🔄 Automatic Updates (Future Enhancement)
Currently, the app doesn't have automatic updates. Here's how to implement them in the future:

#### Option 1: Electron-Updater (Recommended)
```bash
# Install electron-updater
yarn add electron-updater

# Add to package.json
"publish": {
  "provider": "github",
  "owner": "your-username",
  "repo": "tidal-downloader"
}
```

**Implementation steps:**
1. Add update checking to `electron/main.js`
2. Configure GitHub Releases for auto-update
3. Code signing for macOS (required for auto-updates)
4. Add update UI notifications

#### Option 2: Simple Version Check
```javascript
// Check latest version from GitHub API
const response = await fetch('https://api.github.com/repos/owner/repo/releases/latest');
const latest = await response.json();
// Compare with current version, show update notification
```

### 📦 Manual Updates (Current Method)

**For Users:**
1. **Check for Updates**: Visit releases page or check app version
2. **Download**: Get latest DMG file
3. **Replace**: Drag new app to Applications (overwrite old one)
4. **Launch**: New version ready to use

**For Developers:**

#### Creating a New Release:

**🚀 Automated Release (Recommended):**
```bash
./scripts/release.sh
```
This interactive script will:
- Prompt for release type (patch/minor/major)
- Update version numbers
- Run all tests
- Build standalone app
- Create git tag
- Provide GitHub release command

**📝 Manual Release:**
```bash
# 1. Update version in package.json
yarn version --new-version patch  # or minor/major

# 2. Test the new version
./scripts/test-everything.sh

# 3. Build release
./scripts/build-final.sh

# 4. Create GitHub release
git tag v1.0.1
git push origin v1.0.1

# 5. Upload DMG files to GitHub release
```

#### Version Numbering:
- **Patch** (1.0.1): Bug fixes, small improvements
- **Minor** (1.1.0): New features, UI changes
- **Major** (2.0.0): Breaking changes, complete rewrites

### 🚀 Release Distribution Options

#### Option 1: GitHub Releases (Free)
```bash
# Create release with DMG files
gh release create v1.0.1 \
  "dist/Tidal Downloader-1.0.1.dmg" \
  "dist/Tidal Downloader-1.0.1-arm64.dmg" \
  --title "Tidal Downloader v1.0.1" \
  --notes "Bug fixes and improvements"
```

#### Option 2: Direct Download (Simple)
- Host DMG files on your own server
- Provide direct download links
- No GitHub account required for users

#### Option 3: Mac App Store (Future)
- Code signing certificate required ($99/year)
- App Store review process
- Automatic updates through App Store

### 📋 Update Checklist Template

**Before Release:**
- [ ] Version number updated in `package.json`
- [ ] All tests pass: `./scripts/test-everything.sh`
- [ ] Standalone build works: `./scripts/build-final.sh`
- [ ] Components verified: `./scripts/test-standalone.sh`
- [ ] Release notes written
- [ ] Git tag created

**Release Steps:**
- [ ] Create GitHub release
- [ ] Upload Intel DMG
- [ ] Upload Apple Silicon DMG
- [ ] Test download links
- [ ] Announce update (social media, etc.)

**Future Enhancement Ideas:**
- [ ] In-app update notifications
- [ ] Automatic background downloads
- [ ] Rollback capability
- [ ] Beta/stable release channels

## Support

- **Issues**: Create GitHub issue with test output
- **Logs**: Include `/tmp/tidal_downloader.log` for backend issues
- **System**: Include macOS version and architecture

---

**🎵 Happy downloading!**