#!/bin/bash
echo "🛑 Closing existing Skyscope app if running…"
osascript -e 'tell application "Skyscope" to quit' || true

set -e

echo "▶️  Packaging mac build…"
npm run package:mac

echo "🔍 Looking for DMG in release/…"
DMG_PATH=$(ls release/*.dmg | head -n 1)

if [ -z "$DMG_PATH" ]; then
  echo "❌ No DMG found in release/"
  exit 1
fi

echo "📦 Found DMG: $DMG_PATH"

echo "🔧 Mounting DMG…"
# Capture the mount point dynamically
MOUNT_POINT=$(hdiutil attach "$DMG_PATH" | grep Volumes | awk '{for(i=3;i<=NF;i++) printf "%s%s",$i,(i<NF?" ":"")}')

echo "📁 Mounted at: $MOUNT_POINT"

echo "🔍 Searching for .app in DMG…"
APP_PATH=$(find "$MOUNT_POINT" -maxdepth 3 -name "*.app" | head -n 1)

if [ -z "$APP_PATH" ]; then
  echo "❌ No .app found inside DMG!"
  hdiutil detach "$MOUNT_POINT" || true
  exit 1
fi

echo "📲 Installing app to /Applications…"
# Delete existing app first, then copy
APP_NAME=$(basename "$APP_PATH")
rm -rf "/Applications/$APP_NAME"
cp -R "$APP_PATH" /Applications/

echo "💾 Unmounting DMG…"
hdiutil detach "$MOUNT_POINT"

echo "🚀 Launching $APP_NAME…"
/Applications/Skyscope.app/Contents/MacOS/Skyscope &

echo "✅ Installed and launched!"
