import { createCluster } from "@valkey/client"
import { setTimeout as sleep } from "node:timers/promises"

async function main() {
  const startup = process.env.VALKEY_START_NODE || "valkey-node-0:6379"
  const [host, portStr] = startup.split(":")
  const port = Number(portStr);

  const cluster = createCluster({
    rootNodes: [{ url: `valkey://${host}:${port}` }],
    defaults: { socket: { connectTimeout: 5000 } },
  })
  cluster.on("error", (e) => console.error("Valkey error:", e))
  await cluster.connect()

  for (let i = 1; i <= 5; i++) await cluster.set(`string:${i}`, `value_${i}`)
  for (let i = 1; i <= 5; i++) await cluster.rPush("list", `item_${i}`)
  for (let i = 1; i <= 5; i++) await cluster.sAdd("set", `member_${i}`)
  for (let i = 1; i <= 5; i++) await cluster.hSet("hash", { [`field_${i}`]: `value_${i}` })
  for (let i = 1; i <= 5; i++) await cluster.zAdd("zset", [{ score: i, value: `zmember_${i}` }])
  for (let i = 1; i <= 5; i++) { await cluster.xAdd("stream", "*", { sensor: `${1000 + i}`, value: `${20 + i}` }); await sleep(10) }
  for (let i = 1; i <= 5; i++) await cluster.setBit("bitmap", i, 1)
  for (let i = 1; i <= 5; i++) await cluster.pfAdd("hll", `user_${i}`)

  const geos = [
    ["London", -0.1278, 51.5074],
    ["Paris", 2.3522, 48.8566],
    ["NewYork", -74.0060, 40.7128],
    ["Tokyo", 139.6917, 35.6895],
    ["Sydney", 151.2093, -33.8688],
  ];
  await cluster.del("geo");
  for (const [name, lon, lat] of geos) {
    await cluster.geoAdd("geo", { longitude: lon, latitude: lat, member: name })
  }

  console.log("Loaded 5 entries for all Valkey data types.")
  await cluster.quit()
}

main().catch((err) => { console.error(err); process.exit(1); })
