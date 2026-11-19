# OpenTelemetry Collector for Valkey Admin

`otel-collector-config.yaml` is an OpenTelemetry Collector configuration for the OTLP metrics export of Valkey Admin. It receives OTLP on ports 4317 (gRPC) and 4318 (HTTP) and exposes the metrics to Prometheus on port 8889.

Run it with the stock Collector image:

```sh
docker run --rm -p 4317:4317 -p 4318:4318 -p 8889:8889 \
  -v "$PWD/otel-collector-config.yaml:/etc/otelcol-contrib/config.yaml:ro" \
  otel/opentelemetry-collector-contrib:0.137.0
```

Then start Valkey Admin with export turned on:

```sh
METRICS_OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector-host>:4318
```

Point Prometheus at `http://<collector-host>:8889/metrics`. To send the same metrics to another backend, add an exporter to the config and list it in the `metrics` pipeline. You do not need to rebuild an image.

The integration test stack (`docker/docker-compose.test.yml`) runs this file, so `apps/server/src/__integration__/otel-export.integration.test.ts` tests it.

See [OpenTelemetry Export](https://valkey-admin.valkey.io/features/otel-export/) for the exported metrics, the resource attributes and the limitations.
