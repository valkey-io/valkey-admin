# Valkey Admin

## What is Valkey Admin?

Valkey Admin is a web-based administration tool for Valkey clusters. It provides an intuitive interface to monitor, manage, and interact with your Valkey instances, offering features like real-time metrics and key management.

Built with React and TypeScript, Valkey Admin runs as a desktop application via Electron. Some features like hotkeys and commandlogs rely on Electron, so the app is currently only fully supported as a desktop app. Use the web application for a subset of features.

## Platform Support

Valkey Admin works on:
- **macOS** (native support)
- **Linux** (native support)
- **Windows** (via WSL - Windows Subsystem for Linux)

## Quick Start

```bash
./quickstart.sh
```

This builds the full desktop application with all features (hotkeys, commandlogs, etc.). The app will be built in the `release/` folder with connection instructions.

**For web development only:** Use `./quickstart-web.sh` for the development servers (limited features).

### Running the Built Desktop App

After building, launch the desktop app:

**macOS:**
```bash
open "release/Valkey Admin.app"
```

**Linux:**
```bash
# Make executable and run AppImage
chmod +x "release/Valkey Admin-0.0.0.AppImage"
./release/Valkey\ Admin-0.0.0.AppImage

# Or install DEB package
sudo dpkg -i "release/valkey-admin_0.0.0_amd64.deb"
valkey-admin
```

**Windows:** The desktop app builds for Linux/macOS only. Use `./quickstart-web.sh` for web interface.

## Manual Setup

### Desktop App Setup

For the full-featured desktop application:

1. **Install dependencies:** `npm install`
2. **Start Valkey cluster:** `./tools/valkey-cluster/scripts/build_run_cluster.sh`
3. **Build desktop app:**
   - macOS: `npm run package:mac:nosign`
   - Linux: `npm run package:linux:nosign`
4. **Launch app:** Find the built app in `release/` folder and launch it
5. **Connect:** Manually add a connection to `localhost:7001`

### Web Development Setup

For development servers (limited features - no hotkeys/commandlogs):

1. **Install dependencies:** `npm install`
2. **Start Valkey cluster:** `./tools/valkey-cluster/scripts/build_run_cluster.sh`
3. **Start dev servers:** `npm run dev` or use `./quickstart-web.sh`
4. **Connect:** Open http://localhost:5173 and manually add connection to `localhost:7001`

### Windows/WSL Users

Fix line endings before running scripts:
```bash
sed -i 's/\r$//' tools/valkey-cluster/scripts/build_run_cluster.sh
sed -i 's/\r$//' tools/valkey-cluster/scripts/cluster_init.sh
chmod +x tools/valkey-cluster/scripts/*.sh
```

### Shutting Down

```bash
cd tools/valkey-cluster
docker compose down -v
```

## IDE Setup

### VSCode

The repository includes settings for the ESLint extension. Please install it.

**Note:** If you have a formatter i.e. Prettier, it could interfere with the ESLint extension. Please disable it from the workspace.

This requires ESLint v9.0.0 and above.

## Create DMG

You are able to build notarized or non-notarized Applications.

### Unnotarized Application

#### Overview
    - Much faster build process.
    - While you won't encounter any issues running this on the system that built it, distributing the DMG will lead to a `"Valkey Admin" is damaged and can't be opened` error when running the application. To bypass this, run `xattr -c <path/to/app>` in terminal to disable the quarantine flag.

#### Process
In the root directory, create a DMG by running `npm run package:mac:nosign`.

### Notarized Application

#### Overview
    - Much slower build process (could be hours the first time, and up to 10 minutes consequently).
    - Has additional requirements listed in `mac_build`.

#### Process
In the root directory, create a DMG by running `npm run package:mac`.
