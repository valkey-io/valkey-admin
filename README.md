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
