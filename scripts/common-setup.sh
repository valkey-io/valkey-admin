#!/bin/bash
# Common setup functions for quickstart scripts

# Select Docker or fall back to Podman; defines compose() and CONTAINER_ENGINE.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/tools/common/container-engine.sh"

# Function to detect platform
detect_platform() {
    PLATFORM="unknown"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        PLATFORM="mac"
        echo "🍎 macOS detected"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if grep -qi microsoft /proc/version 2>/dev/null; then
            PLATFORM="wsl"
            echo "🐧 WSL (Windows Subsystem for Linux) detected"
            echo "Make sure Docker Desktop (with WSL integration) or Podman is running"
        else
            PLATFORM="linux"
            echo "🐧 Linux detected"
        fi
    else
        echo "❓ Unknown platform: $OSTYPE"
        echo "Proceeding with Linux defaults..."
        PLATFORM="linux"
    fi
    echo ""
}

# Function to install dependencies
install_dependencies() {
    echo "📦 Installing dependencies..."
    npm install
}

# Function to fix line endings for WSL
fix_line_endings() {
    if [ "$PLATFORM" = "wsl" ]; then
        echo "🔧 Fixing line endings for WSL..."
        sed -i 's/\r$//' tools/valkey-cluster/scripts/build_run_cluster.sh 2>/dev/null || true
        sed -i 's/\r$//' tools/valkey-cluster/scripts/cluster_init.sh 2>/dev/null || true
        chmod +x tools/valkey-cluster/scripts/build_run_cluster.sh
        chmod +x tools/valkey-cluster/scripts/cluster_init.sh
    fi
}

# Function to detect IP address
detect_ip() {
    if command -v ipconfig >/dev/null 2>&1; then
        # macOS
        ANNOUNCE_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
    else
        # Linux/WSL - get the default route interface IP
        ANNOUNCE_IP=$(ip route get 1.1.1.1 | grep -oP 'src \K\S+' 2>/dev/null || echo "localhost")
    fi

    if [ -z "$ANNOUNCE_IP" ] || [ "$ANNOUNCE_IP" = "localhost" ]; then
        echo "⚠️  Could not detect IP address, using localhost"
        ANNOUNCE_IP="localhost"
    else
        echo "📡 Detected IP: $ANNOUNCE_IP"
    fi
}

# Function to setup cluster environment
setup_cluster_env() {
    TOOLS_DIR="tools/valkey-cluster"
    ENV_FILE="$TOOLS_DIR/.env"
    ENV_EXAMPLE_FILE="$TOOLS_DIR/.env.example"

    if [ ! -f "$ENV_FILE" ]; then
        cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    fi

    # Update .env file with detected IP and platform
    DOCKER_PLATFORM="linux/arm64"
    if [ "$(uname)" = "Darwin" ]; then
        sed -i '' "s/^ANNOUNCE_HOST = .*/ANNOUNCE_HOST = $ANNOUNCE_IP/" "$ENV_FILE"
        sed -i '' "s|^DOCKER_PLATFORM = .*|DOCKER_PLATFORM = $DOCKER_PLATFORM|" "$ENV_FILE"
    else
        sed -i "s/^ANNOUNCE_HOST = .*/ANNOUNCE_HOST = $ANNOUNCE_IP/" "$ENV_FILE"
        sed -i "s|^DOCKER_PLATFORM = .*|DOCKER_PLATFORM = $DOCKER_PLATFORM|" "$ENV_FILE"
    fi
}

# Function to start cluster
start_cluster() {
    echo "🗄️  Starting Valkey cluster in background..."

    echo "🐳 Starting containers with $CONTAINER_ENGINE in background..."
    cd "$TOOLS_DIR"
    export DOCKER_PLATFORM
    compose --profile populate up --build -d

    # Wait for cluster to be ready (stay in $TOOLS_DIR so `compose` finds the file).
    echo "⏳ Waiting for cluster to be ready..."

    for i in {1..30}; do
        cid=$(compose ps -q valkey-7001 2>/dev/null || true)
        if [ -n "$cid" ] && "$CONTAINER_ENGINE" exec "$cid" valkey-cli -p 7001 cluster info 2>/dev/null | grep -q "cluster_state:ok"; then
            echo "✅ Cluster is ready!"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "⚠️  Cluster health check timed out, but continuing..."
            break
        fi
        echo "   Checking cluster health... ($i/30)"
        sleep 2
    done

    cd ../..
}

# Function to run common setup steps
run_common_setup() {
    detect_platform
    install_dependencies
    fix_line_endings
    detect_ip
    setup_cluster_env
    start_cluster
}
