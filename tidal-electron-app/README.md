# Tidal Downloader - Electron App

Professional Tidal music downloader with React UI and native Mac packaging.

## Prerequisites

- Node.js (v16 or higher)
- Yarn package manager
- Python 3 with required dependencies
- ffmpeg (for audio conversion)

```bash
# Install Yarn globally if not installed
npm install -g yarn

# Install ffmpeg
brew install ffmpeg
```

## Development Setup

1. **Install dependencies:**
```bash
yarn install
```

2. **Run in development mode:**
```bash
yarn electron-dev
```

This will start both the React development server and Electron app.

## Building for Production

### Create packaged app (for testing):
```bash
yarn pack
```

### Create DMG installer:
```bash
yarn dmg
```

### Create full distribution:
```bash
yarn dist
```

## Project Structure

```
tidal-electron-app/
├── src/                 # React source code
│   ├── components/      # React components
│   ├── App.js          # Main React app
│   └── index.js        # React entry point
├── electron/           # Electron main process
│   ├── main.js         # Electron main process
│   └── preload.js      # Electron preload script
├── python/             # Python downloader script
│   └── tidal_downloader.py
└── public/             # Static assets
```

## Features

- 🎵 Download MP3 320kbps or FLAC from Tidal
- 🎧 Perfect for DJ use
- 📱 Beautiful React UI
- 💾 Remembers your preferences
- 📦 Native Mac app packaging
- ⚡ Real-time download progress

## Distribution

The built app will be in the `dist/` folder:
- `Tidal Downloader.dmg` - Mac installer
- `Tidal Downloader.app` - Mac application

Users can simply download the DMG, drag the app to Applications, and use it!