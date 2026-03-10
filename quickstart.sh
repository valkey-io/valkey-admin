#!/bin/bash
set -eu

echo "🖥️  Valkey Admin Desktop Quickstart"
echo "=================================="
echo ""

# This reads the 'version' field from the root package.json
VERSION=$(node -p "require('./package.json').version")
echo "📦 Version detected: $VERSION"

# Source common setup functions
source "$(dirname "$0")/scripts/common-setup.sh"

# Run common setup steps
run_common_setup

# Step 4: Build desktop application
echo "🔨 Building desktop application..."
echo "   This may take a few minutes..."

if [ "$PLATFORM" = "mac" ]; then
    echo "📱 Building macOS app..."
    npm run package:mac:nosign
    APP_PATH="release/Valkey Admin.app"
    echo "✅ macOS app built successfully!"
    echo "📍 Location: $APP_PATH"
elif [ "$PLATFORM" = "linux" ] || [ "$PLATFORM" = "wsl" ]; then
    echo "🐧 Building Linux app..."
    npm run package:linux:nosign
    APP_PATH="release/Valkey Admin-${VERSION}.AppImage"
    echo "✅ Linux app built successfully!"
    echo "📍 Location: $APP_PATH"
    if [ "$PLATFORM" = "linux" ]; then
        chmod +x "$APP_PATH"
        echo "🔧 Made AppImage executable"
    fi
fi

echo ""
echo "🎉 Desktop quickstart complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Launch the app from: $APP_PATH"
echo "   2. Add a connection with these details:"
echo "      - Host: $ANNOUNCE_IP"
echo "      - Port: 7001"
echo "      - Name: Local Valkey Cluster"
echo ""
echo "💡 Cluster management:"
echo "   - Cluster is running in the background"
echo "   - Use 'docker logs valkey-cluster-valkey-7001-1' to see cluster logs"
echo "   - Use 'docker compose -f tools/valkey-cluster/docker-compose.yml down -v' to stop cluster"
echo ""
echo "🚀 Enjoy the full Valkey Admin experience with all features!"
