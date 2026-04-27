# Integration tests

End-to-end tests that drive the server's WebSocket API against a live Valkey cluster stack.

## Quick run

```bash
docker compose -f docker/docker-compose.test.yml up -d --build --wait
npm run test:integration
docker compose -f docker/docker-compose.test.yml down -v
```

## Note
Integration tests are run serially to prevent race conditions as they all use the same connectionId.
