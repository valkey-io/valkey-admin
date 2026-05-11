---
title: Platform Support
description: Supported platforms and platform-specific features
---

Valkey Admin is designed to work across multiple platforms with varying levels of feature support.

## Valkey Version Compatibility

Valkey Admin works with all versions of Valkey. Some features require newer versions:

| Feature | Minimum Version | Additional Requirement |
|---------|----------------|----------------------|
| Command Logs (slow commands, large requests/replies) | Valkey 8.1+ | — |
| Hot Slots Detection | Valkey 8.0+ | `cluster-slot-stats-enabled yes` + LFU eviction policy |

Monitor-based hot keys detection works with any Valkey version.

## Supported Platforms

### macOS (Fully Supported)

- **Native Support**: Full desktop application with all features
- **Minimum Version**: macOS 10.13 (High Sierra) or later
- **Architectures**: Intel (x64) and Apple Silicon (arm64)
- **Package Formats**: `.app`, `.dmg`

**Features**:
- Full desktop application
- Hotkeys support
- Command logs

### Linux (Fully Supported)

- **Native Support**: Full desktop application with all features
- **Package Formats**: AppImage, DEB
- **Tested Distributions**: Ubuntu, Debian, Fedora, Arch

**Features**:
- Full desktop application
- Hotkey support
- Command logs

### Windows (Limited Support)

- **Support Method**: Via WSL (Windows Subsystem for Linux)
- **Deployment**: Web interface only
- **Minimum Version**: Windows 10 version 2004 or higher (for WSL2)

**Features**:
- Web interface only
- No hotkey support
- No command logs
- Core management features
- Real-time monitoring

:::caution
Windows users must use WSL2 to run Valkey Admin. The desktop application does not build for Windows, but the web interface provides most core functionality.
:::

### Docker (Web Deployment)

- **Support Method:** Docker image on any platform
- **Deployment:** Web interface only, served at port `8080`
- **Images:** `valkey/valkey-admin`, `ghcr.io/valkey-io/valkey-admin`, `public.ecr.aws/valkey/valkey-admin`

**Features:**
- Web interface with all core features
- Hot Keys monitoring and Command Logs (Valkey 8.0+/8.1+)
- Pre-configured cluster connection via environment variables

### Kubernetes (Web Deployment)

- **Support Method:** Sidecar pattern — metrics servers run inside each Valkey pod
- **Recommended for:** Large clusters (50+ primaries)

**Features:**
- Web interface with all core features
- Lower memory usage on the main Valkey Admin pod compared to Docker mode
- Hot Keys monitoring and Command Logs (Valkey 8.0+/8.1+)

## Desktop vs Web Features

### Desktop Application (macOS & Linux)

The desktop application built with Electron provides the complete Valkey Admin experience:

| Feature | Desktop | Docker / Kubernetes |
|---------|---------|-----|
| Dashboard & Metrics | ✅ | ✅ |
| Key Browser | ✅ | ✅ |
| Send Command Interface | ✅ | ✅ |
| Cluster Topology | ✅ | ✅ |
| Hot Keys Monitoring | ✅ | ✅ |
| Command Logs | ✅ | ✅ |

### Web Application (All Platforms)

The web interface provides core functionality and is accessible on any platform with a modern browser:

**Supported Browsers**:
- Chrome/Edge (v90+)
- Firefox (v88+)
- Safari (v14+)

## Platform-Specific Considerations

### macOS

**Code Signing & Notarization**:
- Unsigned builds are faster but will show security warnings on first launch
- Notarized builds require an Apple Developer account
- Use `xattr -c <path/to/app>` to remove quarantine flag from unsigned builds

**Building**:
```bash
# Fast (unsigned)
npm run package:mac:nosign

# Production (notarized)
npm run package:mac
```

### Linux

**Permissions**:
- AppImage may require executable permissions: `chmod +x Valkey\ Admin-*.AppImage`
- DEB installation requires sudo: `sudo dpkg -i valkey-admin_*.deb`

**System Integration**:
- Desktop files are automatically installed with DEB packages
- AppImage provides portable execution without installation

### Windows (WSL)

**Setup Requirements**:
1. WSL2 must be installed and configured
2. Docker Desktop with WSL2 integration
3. Ubuntu or similar Linux distribution

**Accessing the Web Interface**:
- The web server runs in WSL but is accessible from Windows browsers
- Default URL: `http://localhost:5173`
- WSL networking automatically bridges to Windows

## Architecture Support

| Platform | x64 | ARM64 | Apple Silicon |
|----------|-----|-------|---------------|
| macOS | ✅ | ✅ | ✅ |
| Linux | ✅ | ✅ | ⚠️ |
| Windows | ✅ (WSL) | ⚠️ (WSL) | ❌ |

:::note
ARM64 support on Linux is experimental. Apple Silicon Macs are fully supported with native arm64 builds.
:::

## Next Steps

- Follow the [installation guide](/getting-started/installation/) for your platform
- Learn about [deployment modes](/deployment/desktop/)
- Get started with the [quick start guide](/getting-started/quick-start/)
