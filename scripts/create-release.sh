#!/bin/bash

# GitHub Release Creation Script for Tidal Downloader
# Usage: ./scripts/create-release.sh [version] [release-notes]
# Example: ./scripts/create-release.sh v1.0.1 "Bug fixes and UI improvements"

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${GREEN}🚀 GitHub Release Creator for Tidal Downloader${NC}"
echo "=================================================="

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install it with: brew install gh"
    echo "Then authenticate with: gh auth login"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}❌ Error: Not authenticated with GitHub${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Get version from parameter or prompt
if [ -n "$1" ]; then
    VERSION="$1"
else
    echo -e "${YELLOW}Enter version (e.g., v1.0.1):${NC}"
    read -r VERSION
fi

# Ensure version starts with 'v'
if [[ ! $VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+.*$ ]]; then
    echo -e "${RED}❌ Error: Version should be in format v1.0.0${NC}"
    exit 1
fi

# Get release notes from parameter or prompt
if [ -n "$2" ]; then
    RELEASE_NOTES="$2"
else
    echo -e "${YELLOW}Enter release notes:${NC}"
    read -r RELEASE_NOTES
fi

echo -e "${GREEN}📋 Release Details:${NC}"
echo "Version: $VERSION"
echo "Notes: $RELEASE_NOTES"
echo ""

# Check if DMG files exist
DMG_PATH="$PROJECT_ROOT/tidal-electron-app/dist"
INTEL_DMG="$DMG_PATH/Tidal Downloader-*.dmg"
ARM_DMG="$DMG_PATH/Tidal Downloader-*-arm64.dmg"

if [ ! -f $INTEL_DMG ] || [ ! -f $ARM_DMG ]; then
    echo -e "${YELLOW}⚠️  DMG files not found. Building app first...${NC}"
    
    # Build the app
    echo -e "${GREEN}🔨 Building standalone app...${NC}"
    ./scripts/build-final.sh
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Build failed${NC}"
        exit 1
    fi
fi

# Find the actual DMG files
INTEL_DMG_FILE=$(ls "$DMG_PATH"/Tidal\ Downloader-*.dmg 2>/dev/null | grep -v arm64 | head -1)
ARM_DMG_FILE=$(ls "$DMG_PATH"/Tidal\ Downloader-*-arm64.dmg 2>/dev/null | head -1)

if [ ! -f "$INTEL_DMG_FILE" ] || [ ! -f "$ARM_DMG_FILE" ]; then
    echo -e "${RED}❌ Error: Could not find DMG files${NC}"
    echo "Expected files:"
    echo "  Intel: $INTEL_DMG_FILE"
    echo "  ARM64: $ARM_DMG_FILE"
    exit 1
fi

echo -e "${GREEN}📦 Found DMG files:${NC}"
echo "  Intel: $(basename "$INTEL_DMG_FILE")"
echo "  ARM64: $(basename "$ARM_DMG_FILE")"
echo ""

# Get file sizes
INTEL_SIZE=$(du -h "$INTEL_DMG_FILE" | cut -f1)
ARM_SIZE=$(du -h "$ARM_DMG_FILE" | cut -f1)

# Confirm release creation
echo -e "${YELLOW}🤔 Ready to create release $VERSION?${NC}"
echo "This will:"
echo "  1. Create a git tag: $VERSION"
echo "  2. Push the tag to GitHub"
echo "  3. Create a GitHub release"
echo "  4. Upload DMG files ($INTEL_SIZE + $ARM_SIZE)"
echo ""
echo -e "${YELLOW}Continue? (y/N):${NC}"
read -r CONFIRM

if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ Release cancelled${NC}"
    exit 0
fi

# Create and push git tag
echo -e "${GREEN}🏷️  Creating git tag...${NC}"
git tag -a "$VERSION" -m "Release $VERSION: $RELEASE_NOTES"
git push origin "$VERSION"

# Create GitHub release with files
echo -e "${GREEN}📤 Creating GitHub release...${NC}"

# Create release notes with file info
FULL_RELEASE_NOTES="$RELEASE_NOTES

## 📥 Downloads

### System Requirements
- **macOS 10.12+** (Sierra or later)
- **No additional software needed** - completely standalone!

### Download Options
- **Intel Macs**: \`$(basename "$INTEL_DMG_FILE")\` ($INTEL_SIZE)
- **Apple Silicon Macs**: \`$(basename "$ARM_DMG_FILE")\` ($ARM_SIZE)

### Installation
1. Download the appropriate DMG for your Mac
2. Double-click to mount the DMG
3. Drag \"Tidal Downloader\" to Applications folder
4. Right-click the app → \"Open\" (first time only)

### What's Included
✅ Complete Tidal Downloader app  
✅ Queue management system  
✅ 320kbps MP3 conversion  
✅ Metadata extraction  
✅ Progress tracking  
✅ **Zero external dependencies**

---
🤖 *Built with [Claude Code](https://claude.ai/code)*"

# Create the release
gh release create "$VERSION" \
    "$INTEL_DMG_FILE" \
    "$ARM_DMG_FILE" \
    --title "Tidal Downloader $VERSION" \
    --notes "$FULL_RELEASE_NOTES" \
    --latest

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 SUCCESS! Release created successfully!${NC}"
    echo ""
    echo -e "${GREEN}📊 Release Summary:${NC}"
    echo "  Version: $VERSION"
    echo "  Files uploaded: 2 DMG files"
    echo "  Total size: $INTEL_SIZE + $ARM_SIZE"
    echo ""
    echo -e "${GREEN}🔗 View release:${NC}"
    gh release view "$VERSION" --web
else
    echo -e "${RED}❌ Failed to create release${NC}"
    exit 1
fi