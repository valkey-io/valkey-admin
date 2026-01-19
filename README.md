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

### Manual Connection
Once the app is running, manually add a connection to your cluster (default local cluster is usually `localhost:7001`).

## Contributing
Interested in improving Valkey Admin? Please see our [CONTRIBUTING.md](./CONTRIBUTING.md) for environment setup, WSL instructions, and development workflows.

## License
Valkey Admin is released under the **Apache License 2.0**.
