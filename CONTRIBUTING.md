# Contributing to Valkey Admin

First off, thank you for taking the time to contribute! Contributions from the community help make Valkey Admin a powerful tool for everyone. To maintain the quality and architectural integrity of the project, we follow a structured contribution process.

---

## Restrictions on Generative AI Usage
We expect authentic engagement in our community.

If you use generative AI tools as an aid in developing code or documentation changes, ensure that you fully understand the proposed changes and can explain why they are the correct approach.

If you do not fully understand some bits of the AI generated code, call out unknowns and assumptions. You should comment on these cases and point them out to reviewers so that they can use their knowledge of the codebase to clear up any concerns. For example, you might comment “calling this function here seems to work but I’m not familiar with how it works internally, I wonder if there’s a race condition if it is called concurrently”.

Make sure you have added value based on your personal competency to your contributions. Just taking some input, feeding it to an AI and posting the result is not of value to the project. To preserve precious core developer capacity, we reserve the right to rigorously reject seemingly AI generated low-value contributions.

## The RFC (Request for Comments) Process

Before you start writing code for a new feature or a significant architectural change, you **must** create an RFC:

1.  **Open an Issue:** Create a new GitHub Issue with the prefix `[RFC] Your Feature Name`.
2.  **Design Proposal:** Provide a general design or technical overview of your approach. Explain the *why* and the *how*.
3.  **Tag a Maintainer:** Tag @arseny-kostenko, @ravjotbrar, @ArgusLi, and/or, @nassery318
4.  **Approval:** Wait for feedback and approval from the project contributors. 
5.  **Proceed:** Once the design is approved, you are cleared to begin development and submit a PR.

*Note: Small bug fixes or documentation typos do not require an RFC.*

---

## Technical Architecture & Patterns

To ensure a maintainable and scalable codebase, please adhere to the following architectural patterns:

### State Management & Components
* **Redux as Source of Truth:** Redux is the single source of truth for application state. 
* **Presentational Components:** Prefer "dumb" or presentational components. These should focus on rendering Redux state and dispatching actions. Avoid embedding business logic directly within React components.
* **Local UI State:** React component state should be reserved strictly for local UI concerns (e.g., controlled inputs, toggle states).

### Side Effects & Async Flows
We use **RxJS-based middleware (Epics)** to handle side effects and asynchronous logic.
* **Observable Pipelines:** Side effects are modeled as streams of actions. Epics should listen for specific actions and emit new actions using observable pipelines.
* **Pure Reducers:** Keep all side effects out of both components and reducers to maintain predictability.

### Hooks Organization
* **Global Hooks:** The `/hooks` folder is strictly for global or truly reusable hooks shared across multiple components.
* **Local Hooks:** If a function or hook is used by only one component, it should live in a file adjacent to that component's file, not in the global directory.

### Consistency
Before contributing, please take the time to familiarize yourself with the existing codebase and conventions. We value consistency in patterns and naming above all else.

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

Note: you will see
```
• skipped macOS notarization  reason=`notarize` options were set explicitly `false`
```
This is as we are not using electron builder's notarization tool, rather electron-notarize.

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
