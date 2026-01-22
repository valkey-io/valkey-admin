import * as R from "ramda"
import { createClient } from "@valkey/client"
import { setTimeout as sleep } from "timers/promises"

async function main() {
  const TOTAL_KEYS = 100000
  const BATCH_SIZE = 1000

  const client = createClient({ url: "valkey://localhost:6379" })
  client.on("error", e => console.error("Valkey error:", e))
  await client.connect()

  const I = R.range(1, 6)

  const geoPoints = [
    { member: "London",  longitude: -0.1278, latitude:  51.5074 },
    { member: "Paris",   longitude:  2.3522, latitude:  48.8566 },
    { member: "NewYork", longitude: -74.0060, latitude: 40.7128 },
    { member: "Tokyo",   longitude: 139.6917, latitude: 35.6895 },
    { member: "Sydney",  longitude: 151.2093, latitude: -33.8688 },
  ]

  await Promise.all([
    ...I.map(i => client.set(`string:${i}`, `value_${i}`)),
    ...I.map(i => client.rPush("list", `item_${i}`)),
    ...I.map(i => client.sAdd("set", `member_${i}`)),
    ...I.map(i => client.hSet("hash", { [`field_${i}`]: `value_${i}` })),
    ...I.map(i => client.zAdd("zset", [{ score: i, value: `zmember_${i}` }])),
    ...geoPoints.map(p => client.geoAdd("geo", p)),
    ...I.map(i => client.setBit("bitmap", i, 1)),
  ])

  for (let i = 1; i <= 5; i++) {
    await client.xAdd("stream", "*", { sensor: `${1000 + i}`, value: `${20 + i}` })
    await sleep(50)
  }

  console.log("Loaded initial entries for all Valkey data types.")

  console.log(`Adding ${TOTAL_KEYS} additional string keys in batches of ${BATCH_SIZE}...`)

  for (let start = 1; start <= TOTAL_KEYS; start += BATCH_SIZE) {
    const batchEnd = Math.min(start + BATCH_SIZE - 1, TOTAL_KEYS)
    const promises = []

    for (let i = start; i <= batchEnd; i++) {
      promises.push(client.set(`bulk:key:${i}`, `value_${i}`))
    }

    await Promise.all(promises)
    console.log(`Created keys ${start} → ${batchEnd}`)
  }

  console.log("All additional string keys created successfully.")
  await client.quit()
}

main().catch(err => { console.error(err); process.exit(1) })
