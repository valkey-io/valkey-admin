---
title: Docker Deployment
description: Deploy Valkey Admin using Docker or Docker Compose
---

Run Valkey Admin using Docker or Docker Compose for a zero-install web deployment.

## Docker Images

Valkey Admin images are published to the following registries:

| Registry | Image |
|----------|-------|
| GitHub Container Registry | `ghcr.io/valkey-io/valkey-admin` |
| Docker Hub | `valkey/valkey-admin` |
| Amazon ECR Public Gallery | `public.ecr.aws/valkey/valkey-admin` |

```bash
docker pull valkey/valkey-admin:latest
```

## Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  valkey-admin:
    image: valkey/valkey-admin:latest
    ports:
      - "8080:8080"
    environment:
      DEPLOYMENT_MODE: Web
    restart: unless-stopped
```

Start the service:

```bash
docker compose up -d
```

Open `http://localhost:8080` and add a connection to your Valkey instance through the UI.

## With Pre-configured Cluster Connection

To auto-start metrics collection on startup, provide cluster connection details as environment variables:

```yaml
services:
  valkey-admin:
    image: valkey/valkey-admin:latest
    ports:
      - "8080:8080"
    environment:
      DEPLOYMENT_MODE: Web
      VALKEY_HOST: my-valkey-host.example.com
      VALKEY_PORT: 6379
      VALKEY_TLS: "true"
      VALKEY_AUTH_TYPE: password
      VALKEY_USERNAME: myuser
      VALKEY_PASSWORD: mypassword
    restart: unless-stopped
```

## Custom Metrics Configuration

To override the default metrics collection and retention settings, mount a custom `config.yml`:

```yaml
services:
  valkey-admin:
    image: valkey/valkey-admin:latest
    ports:
      - "8080:8080"
    environment:
      DEPLOYMENT_MODE: Web
      CONFIG_PATH: /app/custom-config.yml
    volumes:
      - ./my-config.yml:/app/custom-config.yml:ro
    restart: unless-stopped
```

See the [Metrics Configuration](/configuration/metrics/) page for available options.

## Resource Sizing

In Docker (Web) mode, Valkey Admin spawns a metrics server process per primary node. See [Resource Sizing](/deployment/resource-sizing/) for formulas, recommendations, and retention guidance.

## Configuration Reference

See the [Configuration](/configuration/server/) section for all available environment variables.

## Next Steps

- [Kubernetes deployment](/deployment/kubernetes/) for large clusters
- [AWS ElastiCache deployment](/deployment/aws-elasticache/) for production on AWS
