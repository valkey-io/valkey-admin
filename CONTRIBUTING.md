# Contributing to Valkey Admin

First off, thank you for taking the time to contribute! Contributions from the community help make Valkey Admin a powerful tool for everyone. To maintain the quality and architectural integrity of the project, we follow a structured contribution process.

---

## The RFC (Request for Comments) Process

Before you start writing code for a new feature or a significant architectural change, you **must** create an RFC:

1.  **Open an Issue:** Create a new GitHub Issue with the prefix `[RFC] Your Feature Name`.
2.  **Design Proposal:** Provide a general design or technical overview of your approach. Explain the *why* and the *how*.
3.  **Approval:** Wait for feedback and approval from the project contributors. 
4.  **Proceed:** Once the design is approved, you are cleared to begin development and submit a PR.

*Note: Small bug fixes or documentation typos do not require an RFC.*

---

## Reporting Bugs & Feature Requests

We use GitHub Issues to track bugs and suggest new features.

* **Bugs:** Before opening an issue, please check if it has already been reported. When filing a bug, include your OS and steps to reproduce.
* **Feature Requests:** Open an issue describing the functionality you’d like to see and how it benefits Valkey Admin users.

---

## Development Environment Setup

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


---

## Coding Standards

### Linting & Formatting
We use **ESLint v9.0.0+** to maintain code quality.
* **No Prettier:** Please **disable Prettier** in your IDE workspace for this project. It interferes with our ESLint configuration.
* **Automatic Linting:** We recommend the ESLint extension for VSCode. The repository includes settings to help you follow our style guide automatically.

---

## Pull Request Process

1. **Create a Branch:** Create a descriptively named feature branch from `main`.
2. **Commit Changes:** Write clear, concise commit messages.
3. **Sync with Upstream:** Ensure your branch is up to date with the main `valkey-admin` repository.
4. **Submit PR:** Open a Pull Request against the `main` branch.
5. **Approval:** All Pull Requests require at least one approval from a project contributor before they can be merged.

---

## License

By contributing to Valkey Admin, you agree that your contributions will be licensed under the **Apache License 2.0**.
