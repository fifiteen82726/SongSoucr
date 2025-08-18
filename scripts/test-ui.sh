#!/bin/bash

echo "🎯 Tidal Downloader UI Flow Test"
echo "================================"
echo ""
echo "This test will:"
echo "1. ✅ Start the Electron app"
echo "2. ✅ Verify the UI is loaded"
echo "3. ⏳ Give you 30 seconds to manually test"
echo "4. 🧽 Clean up automatically"
echo ""
echo "Manual test steps:"
echo "👉 1. Paste: https://tidal.com/browse/track/431665151?u"
echo "👉 2. Click 'Add to Queue'"
echo "👉 3. Watch download progress"
echo "👉 4. Check ~/Desktop/DJ/ for MP3 file"
echo ""

read -p "Press Enter to start the test..."

cd "$(dirname "$0")"
chmod +x test-electron-ui.js

node test-electron-ui.js