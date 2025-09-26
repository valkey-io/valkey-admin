# Valkey Skyscope

## Getting Started (Development)

### Start Valkey Cluster

1. Change your working directory to the docker directory: `cd docker`
2. Start your cluster with 3 nodes and replicas on `127.0.0.1:7000`:

    To start up and populate fake data: `docker compose --profile populate up --build`.

    To start up without running the populate service:`docker compose up --build`.

3. Add key value pairs using Redis Insight (Optional)

### Running the apps

1. Install all dependencies from the project root: `npm ci`
2. Run both server and frontend: `npm run dev`

## IDE Setup

### VSCode

The repository includes settings for the ESLint extension. Please install it.
