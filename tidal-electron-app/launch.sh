#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

for executable in node yarn; do
    if ! command -v "$executable" >/dev/null 2>&1; then
        echo "Install Node.js and Yarn before starting Tidal Downloader." >&2
        exit 1
    fi
done

if [[ ! -f node_modules/electron/index.js || ! -f node_modules/react-scripts/bin/react-scripts.js ]]; then
    printf 'Install app dependencies first: yarn --cwd %q install --frozen-lockfile\n' "$APP_DIR" >&2
    exit 1
fi

if [[ -f ../.venv/bin/activate ]]; then
    source ../.venv/bin/activate
fi

# Build after each pull so the GUI and main process use the current source.
yarn build
ELECTRON_BINARY="$(node -p 'require("electron")')"
echo "🎵 Launching Tidal Downloader..."
exec "$ELECTRON_BINARY" . "$@"
