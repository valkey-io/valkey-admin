# Docker Deployment

Run Valkey Admin using Docker Compose.

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

See [apps/metrics/config.yml](../apps/metrics/config.yml) for the default configuration and available options.

## Configuration Reference

See the [Configuration](../README.md#configuration) section in the README for all available environment variables.
