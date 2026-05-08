---
title: Desktop Deployment
description: Deploy and use Valkey Admin as a native desktop application
---

Valkey Admin's desktop application is built with Electron, providing full features and native integration on macOS and Linux.

## When to Choose Desktop

Choose the desktop app when you:

- Run macOS or Linux
- Need to monitor hot keys
- Need to monitor command logs (slow logs, large requests and large replies)

## Installation

Download the latest release from [GitHub Releases](https://github.com/valkey-io/valkey-admin/releases):

- **macOS:** Download the `.dmg` file, open it, and drag Valkey Admin to Applications
- **Linux:** Download the `.AppImage` or `.deb` package

## Desktop Features

### Hot Keys

Track the most frequently accessed keys in your cluster in real time. The desktop app surfaces per-key access statistics so you can spot traffic imbalances before they become bottlenecks.

Hot Keys monitoring is configured in [Settings](/settings/settings/) — enable it and set the sample duration and interval to match your workload.

### Command Logs

The desktop app records three categories of commands that are most likely to affect cluster health:

- **Slow Logs** — commands that exceeded the configured execution time threshold
- **Large Requests** — commands with oversized input payloads
- **Large Replies** — commands that returned oversized responses

See [Activity](/features/activity/) for threshold configuration and analysis guidance.

### Keyboard Shortcuts

The desktop app adds a **Shortcuts** menu to the native application menu bar, providing quick keyboard navigation to any section of the app.

| macOS | Linux | Destination |
|-------|-------|-------------|
| `Cmd + 1` | `Ctrl + 1` | Connections |
| `Cmd + 2` | `Ctrl + 2` | Dashboard |
| `Cmd + 3` | `Ctrl + 3` | Key Browser |
| `Cmd + 4` | `Ctrl + 4` | Activity |
| `Cmd + 5` | `Ctrl + 5` | Send Command |
| `Cmd + 6` | `Ctrl + 6` | Cluster Topology |
| `Cmd + 7` | `Ctrl + 7` | Settings |
| `Cmd + 8` | `Ctrl + 8` | Learn More |

These shortcuts are available from anywhere in the app and navigate directly to the corresponding view without using the sidebar.
