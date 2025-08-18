#!/bin/bash

echo "🚀 Tidal Downloader Release Helper"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "tidal_downloader.py" ]; then
    echo "❌ Please run this script from the tidalDownloader directory"
    exit 1
fi

# Function to log messages
log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

# Get current version
cd tidal-electron-app
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📋 Current version: $CURRENT_VERSION"

# Ask for release type
echo ""
echo "🔢 What type of release?"
echo "1. Patch (bug fixes): $CURRENT_VERSION → $(yarn version --no-git-tag-version --new-version patch --dry-run 2>/dev/null || echo 'patch')"
echo "2. Minor (new features): $CURRENT_VERSION → $(yarn version --no-git-tag-version --new-version minor --dry-run 2>/dev/null || echo 'minor')"  
echo "3. Major (breaking changes): $CURRENT_VERSION → $(yarn version --no-git-tag-version --new-version major --dry-run 2>/dev/null || echo 'major')"
echo "4. Custom version"
echo "5. Cancel"

read -p "Enter choice (1-5): " choice

case $choice in
    1)
        RELEASE_TYPE="patch"
        ;;
    2)
        RELEASE_TYPE="minor"
        ;;
    3)
        RELEASE_TYPE="major"
        ;;
    4)
        read -p "Enter new version (e.g., 1.2.3): " NEW_VERSION
        RELEASE_TYPE="$NEW_VERSION"
        ;;
    5)
        echo "❌ Release cancelled"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

cd ..

# Update version
log "📝 Updating version..."
cd tidal-electron-app
if [[ "$RELEASE_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # Custom version
    yarn version --no-git-tag-version --new-version "$RELEASE_TYPE"
    NEW_VERSION="$RELEASE_TYPE"
else
    # Standard release type
    yarn version --no-git-tag-version --new-version "$RELEASE_TYPE"
    NEW_VERSION=$(node -p "require('./package.json').version")
fi

log "✅ Version updated to: $NEW_VERSION"
cd ..

# Run tests
log "🧪 Running comprehensive tests..."
if ! ./test-everything.sh; then
    echo "❌ Tests failed! Please fix issues before release."
    exit 1
fi

log "✅ All tests passed!"

# Build release
log "🏗️  Building standalone release..."
if ! ./build-final.sh; then
    echo "❌ Build failed! Please check output above."
    exit 1
fi

log "✅ Build completed successfully!"

# Verify standalone components
log "🔍 Verifying standalone components..."
if ! ./test-standalone.sh; then
    echo "❌ Standalone verification failed!"
    exit 1
fi

log "✅ Standalone components verified!"

# Commit version change
log "📝 Committing version change..."
git add tidal-electron-app/package.json tidal-electron-app/package-lock.json
git commit -m "Bump version to $NEW_VERSION"

# Create git tag
log "🏷️  Creating git tag..."
git tag "v$NEW_VERSION"

echo ""
echo "🎉 Release v$NEW_VERSION prepared successfully!"
echo ""
echo "📦 Built files:"
ls -la tidal-electron-app/dist/*.dmg 2>/dev/null || echo "❌ No DMG files found"
echo ""
echo "📋 Next steps:"
echo "1. Push changes: git push origin main"
echo "2. Push tag: git push origin v$NEW_VERSION"
echo "3. Create GitHub release with DMG files"
echo "4. Upload both DMG files to the release"
echo ""
echo "🌐 GitHub release command:"
echo "gh release create v$NEW_VERSION \\"
echo "  'tidal-electron-app/dist/Tidal Downloader-$NEW_VERSION.dmg' \\"
echo "  'tidal-electron-app/dist/Tidal Downloader-$NEW_VERSION-arm64.dmg' \\"
echo "  --title 'Tidal Downloader v$NEW_VERSION' \\"
echo "  --notes 'Release notes here'"
echo ""
echo "✅ Release ready for distribution!"