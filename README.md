# Valkey Skyscope

## Getting Started (Development)

### Start Valkey Cluster

1. Change your working directory to the docker directory: `cd tools/valkey-cluster`
2. Create a `.env` file based on `.env.example`
3. Start your cluster with 3 nodes and replicas on `127.0.0.1:7001`:

    To start up and populate fake data: `docker compose --profile populate up --build`.

    To start up without running the populate service:`docker compose up --build`.

4. Add key value pairs using Redis Insight (Optional)

### Running the apps

1. Install all dependencies from the project root: `npm ci`
2. Run both server and frontend: `npm run dev`

## IDE Setup

### VSCode

The repository includes settings for the ESLint extension. Please install it.

**Note:** If you have a formatter i.e. Prettier, it could interfere with the ESLint extension. Please disable it from the workspace.

This requires ESLint v9.0.0 and above.

## Create DMG
In the root directory, create a DMG by running `npm run package:mac`.
**Note:** The DMG is not signed. Distributing it will lead to a `"Skyscope" is damaged and can't be opened` error when running the application. To bypass this, run `xattr -c <path/to/app>` in terminal to disable the quarantine flag.
