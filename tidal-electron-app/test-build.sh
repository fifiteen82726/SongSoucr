#!/bin/bash

echo "🚀 Building Tidal Downloader React + Electron App..."

# Build React app
echo "📦 Building React app..."
yarn build

echo "✅ React app built successfully!"
echo "📱 You can now run 'yarn electron' to test the app"
echo "📀 Or run 'yarn dmg' to create Mac installer"

echo ""
echo "🎯 Next steps:"
echo "  1. yarn electron    - Test the app"  
echo "  2. yarn dmg         - Create DMG installer"
echo "  3. yarn dist        - Create full distribution"