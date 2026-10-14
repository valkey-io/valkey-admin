# Telemetry

> **Status: Proposed — not yet implemented or active.**
> Valkey Admin does **not** currently collect any telemetry. This document describes a
> proposed opt-in analytics feature that is under community discussion
> ([#483](https://github.com/valkey-io/valkey-admin/discussions/483)) and pending review
> under the [LF Projects Telemetry Data Collection and Usage Policy](https://lfprojects.org/policies/telemetry-data-policy/).
> No data will be collected unless and until that review is approved and the feature ships.

## Summary

Valkey Admin proposes an **opt-in, anonymous** usage-analytics signal with one narrow goal:
understand **how many people use the app and through which deployment mode**. This helps
maintainers prioritize where to invest (for example, how much effort to put into Electron
versus Web or Kubernetes deployments).

It is **off by default**. Nothing is ever sent unless you explicitly turn it on.

## What is collected

If — and only if — you opt in, the app sends a single `app_started` event containing:

| Field | Example | Purpose |
|---|---|---|
| Hashed install ID | SHA-256 hash of a locally-stored random UUID | De-duplicate installs so restarts by one user aren't counted as many users |
| Deployment mode | `Web` / `Electron` / `Kubernetes` / `Docker` | The dimension we want to measure |
| App version | `1.2.0` | Distinguish which versions are actively used |

The install ID is a random UUID generated and stored locally. **Only a SHA-256 hash of it is
transmitted**, so the value we receive cannot be reversed to the local ID. It is used solely
for de-duplication and has no other purpose.

## What is NOT collected

- No names, emails, or user accounts
- No IP addresses, hostnames, or cluster/connection addresses
- No Valkey commands, key names, or values
- No credentials or connection details
- No feature-usage, page-view, or behavioral tracking
- No operating-system or browser fingerprinting

## Consent

- **Opt-in, off by default.** No telemetry is sent without your explicit consent.
- On **first launch**, a one-time prompt explains exactly what is collected and links to this
  document. Nothing is sent unless you accept.
- Because Valkey Admin runs in the browser, **each end user controls their own consent** from
  their own device — not just whoever deployed the server.

## How to opt out (or back in)

- Open **Settings → Telemetry** and toggle it off (or on) at any time. Turning it off stops all
  further collection immediately.
- Declining the first-run prompt has the same effect as leaving it off.

## Where the data goes

Collected data is stored under Valkey project / Linux Foundation custody (never a personal
account) and is used only in aggregate. Aggregate results are published on a **public,
read-only dashboard** so the community sees exactly the same numbers the maintainers do. The
data-store and dashboard details are being finalized as part of the LF telemetry review.

## Data retention

Aggregate event data is proposed to be retained for **12 months**; only derived aggregates are
surfaced publicly. (Subject to LF review.)

## Future plans

Any expansion of what is collected will be **proposed publicly first** (in a discussion like
[#483](https://github.com/valkey-io/valkey-admin/discussions/483)), documented here, and remain
under the same opt-in. Possibilities under consideration for the future — none of which are
collected today — include feature-usage frequency, aggregate cluster-size buckets, and error
rates by feature. Sending would also move from "immediately on consent" to on app close /
periodic batching.

## Open source & auditability

The entire collection mechanism lives in this repository and is fully reviewable. If you prefer,
organizations can also block traffic to the telemetry ingestion endpoint at the network level,
regardless of the in-app setting.
