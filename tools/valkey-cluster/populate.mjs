import * as R from "ramda"
import { createCluster } from "@valkey/client"
import { setTimeout as sleep } from "timers/promises"

async function main() {
  const startup = process.env.VALKEY_START_NODE || "valkey-node-0:6379"
  const [host, portStr] = startup.split(":")
  const port = Number(portStr)

  const cluster = createCluster({
    rootNodes: [{ url: `valkey://${host}:${port}` }],
    defaults: { socket: { connectTimeout: 5000 } },
  })
  cluster.on("error", e => console.error("Valkey error:", e))
  await cluster.connect()

  const I = R.range(1, 6)

  // clean up
  await Promise.all(
    ["geo", "list", "set" ,"hash", "zset", "bitmap", "stream", ...I.map(i => `string:${i}`)].map(k => cluster.del(k))
  )

  const geoPoints = [
    { member: "London",  longitude: -0.1278, latitude:  51.5074 },
    { member: "Paris",   longitude:  2.3522, latitude:  48.8566 },
    { member: "NewYork", longitude: -74.0060, latitude: 40.7128 },
    { member: "Tokyo",   longitude: 139.6917, latitude: 35.6895 },
    { member: "Sydney",  longitude: 151.2093, latitude: -33.8688 },
  ]

  await Promise.all([
    ...I.map(i => cluster.set(`string:${i}`, `value_${i}`)),
    ...I.map(i => cluster.rPush("list", `item_${i}`)),
    ...I.map(i => cluster.sAdd("set", `member_${i}`)),
    ...I.map(i => cluster.hSet("hash", { [`field_${i}`]: `value_${i}` })),
    ...I.map(i => cluster.zAdd("zset", [{ score: i, value: `zmember_${i}` }])),
    ...geoPoints.map(p => cluster.geoAdd("geo", p)),
    ...I.map(i => cluster.setBit("bitmap", i, 1)),
  ])

  // streams gotta be sequential
  for (let i = 1; i <= 5; i++) {
    await cluster.xAdd("stream", "*", { sensor: `${1000 + i}`, value: `${20 + i}` })
    await sleep(50) // sleep here is to make each xAdd get a unique, increasing timestamp
  }

  console.log("Loaded entries for all Valkey data types.")
  await cluster.quit()
}

main().catch(err => { console.error(err); process.exit(1) })
