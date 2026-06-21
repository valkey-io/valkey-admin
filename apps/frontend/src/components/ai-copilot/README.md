# AI Copilot

An AI-assisted operations panel for Valkey Admin. It analyzes live database
metrics, converts natural language into safe Valkey commands, and remembers
past investigations using [Breeth](https://www.thebreeth.com) as a persistent
memory layer.

## Features

1. **AI Performance Analyzer** — Health Score, Root Cause, Risk Assessment,
   Recommendations, and Optimization Opportunities derived from live metrics.
2. **Natural Language Commands ("Ask Valkey")** — type plain-English requests;
   the command engine generates safe, read-only Valkey commands. Destructive
   operations (DEL, FLUSHALL, CONFIG SET, etc.) are blocked.
3. **Breeth Memory** — analyses are saved to Breeth and recalled across
   sessions. Includes "Past Investigations" and "Similar Incidents".

## Architecture

```
Browser (React)
  └── services/breeth.ts        → calls local backend only
        │
        ▼
Valkey Admin Backend (Express)
  └── /api/ai-copilot/save-analysis   (POST)
  └── /api/ai-copilot/history         (GET)
  └── /api/ai-copilot/search-similar  (POST)
        │  (adds Authorization: Bearer <BREETH_API_KEY>)
        ▼
Breeth API (https://api.thebreeth.com/v1/*)
```

The Breeth API key is **never** exposed to the browser. It lives only in the
server process via the `BREETH_API_KEY` environment variable.

## Setup

The AI Copilot memory features require a Breeth API key.

1. Mint a key in the Breeth dashboard: **API Keys → New key**.
2. Provide it to the server via the `BREETH_API_KEY` environment variable.

### Local (node)

```bash
# from repo root
export BREETH_API_KEY=ck_live_xxx   # Windows (PowerShell): $env:BREETH_API_KEY="ck_live_xxx"
node apps/server/dist/index.js
```

### Docker Compose

```bash
# Pass the key from your shell environment (compose reads ${BREETH_API_KEY})
export BREETH_API_KEY=ck_live_xxx
docker compose -f docker/docker-compose.yml up --build -d
```

Or create a `.env` file next to `docker-compose.yml`:

```
BREETH_API_KEY=ck_live_xxx
```

See `apps/server/.env.example` for reference.

## Behavior without a key

If `BREETH_API_KEY` is not set, the three `/api/ai-copilot/*` endpoints return
**HTTP 500** with a clear message:

```json
{ "ok": false, "error": "Breeth integration is not configured. Set the BREETH_API_KEY environment variable on the server." }
```

The Performance Analyzer and Natural Language Commands still work locally; only
the memory persistence/retrieval features require the key.

## Files

| File | Purpose |
|------|---------|
| `apps/frontend/src/components/ai-copilot/AICopilot.tsx` | Main page component |
| `apps/frontend/src/services/analysis-engine.ts` | Health analysis logic |
| `apps/frontend/src/services/command-engine.ts` | NLP → command + safety layer |
| `apps/frontend/src/services/breeth.ts` | Frontend client for backend endpoints |
| `apps/server/src/index.ts` | Backend `/api/ai-copilot/*` endpoints |
| `apps/server/.env.example` | Documents the required `BREETH_API_KEY` |
