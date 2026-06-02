import { createClient } from "@valkey/client"
import {
  parseEnv,
  seedDatabase,
  selectDatabase,
  assertConfiguredDatabases,
} from "../common/populate-helpers.mjs"

async function main() {
  const { dbCount, bulkKeys } = parseEnv()
  const client = createClient({ url: process.env.VALKEY_URL ?? "valkey://localhost:6379" })
  client.on("error", e => console.error("Valkey error:", e))
  await client.connect()

  await assertConfiguredDatabases(client, dbCount, false)

  for (let d = 0; d < dbCount; d++) {
    await selectDatabase(client, d)
    await seedDatabase(client, d, { bulkKeys })
  }

  await client.quit()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
