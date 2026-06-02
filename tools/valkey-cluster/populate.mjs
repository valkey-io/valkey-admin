import { createCluster } from "@valkey/client"
import {
  parseEnv,
  seedDatabase,
  assertConfiguredDatabases,
  assertClusterVersion,
  wrapDbError,
} from "../common/populate-helpers.mjs"

const ROOT_NODES = [
  { url: `valkey://${process.env.VALKEY_START_NODE ?? "valkey-7001:7001"}` },
]

async function main() {
  const { dbCount, bulkKeys } = parseEnv()

  // Probe connection: validate the cluster's Valkey version meets the
  // multi-database baseline and that the deployment is configured for at
  // least `dbCount` logical databases. The probe pins itself to database 0
  // so the version/CONFIG queries are safe on pre-multi-DB clusters.
  const probe = createCluster({
    rootNodes: ROOT_NODES,
    defaults: { database: 0, socket: { connectTimeout: 5000 } },
  })
  probe.on("error", e => console.error("Valkey error:", e))
  await probe.connect()
  try {
    await assertClusterVersion(probe)
    await assertConfiguredDatabases(probe, dbCount, true)
  } finally {
    await probe.quit()
  }

  // Per-DB seed: reconnect with `defaults.database = d` so every pooled node
  // connection issues `SELECT d` on connect. The pool is short-lived (one
  // database's worth of writes), so any reconnects within the pool also
  // re-select. See design.md → Components and Interfaces / Top-level
  // orchestration (cluster).
  for (let d = 0; d < dbCount; d++) {
    const cluster = createCluster({
      rootNodes: ROOT_NODES,
      defaults: { database: d, socket: { connectTimeout: 5000 } },
    })
    cluster.on("error", e => console.error(`[db${d}] valkey error:`, e))
    await cluster.connect()
    try {
      await seedDatabase(cluster, d, { bulkKeys })
    } catch (err) {
      throw wrapDbError(err, d)
    } finally {
      await cluster.quit()
    }
  }

  console.log(`Connect to your cluster using host: ${process.env.ANNOUNCE_HOST}`)
}

main().catch(err => { console.error(err); process.exit(1) })
