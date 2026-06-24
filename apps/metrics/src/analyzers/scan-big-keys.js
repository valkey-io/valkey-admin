import { Heap } from "heap-js"

export const scanBigKeys = async (client, { scanLimit = 10000, topN = 50, batchSize = 100 } = {}) => {
  const heap = new Heap((a, b) => a.sizeBytes - b.sizeBytes)

  const totalKeys = Number(await client.customCommand(["DBSIZE"]))

  let cursor = "0"
  let scanned = 0

  do {
    const [nextCursor, keys] = await client.customCommand(["SCAN", cursor, "COUNT", batchSize.toString()])
    cursor = nextCursor

    for (const key of keys) {
      const [sizeBytes, type, ttl] = await Promise.all([
        // sample 5 elements to estimate size faster on big keys
        client.customCommand(["MEMORY", "USAGE", key, "SAMPLES", "5"]),
        client.customCommand(["TYPE", key]),
        client.customCommand(["TTL", key]),
      ])

      const entry = { key, sizeBytes: Number(sizeBytes), type, ttl: Number(ttl) }

      if (heap.size() < topN) {
        heap.push(entry)
      } else if (Number(sizeBytes) > heap.peek().sizeBytes) {
        heap.pop()
        heap.push(entry)
      }

      scanned++
    }
    // scanLimit controls how many keys are scanned, not how many are returned
  } while (cursor !== "0" && scanned < scanLimit)

  return {
    // topN keys returned in descending order of sizeBytes
    keys: heap.toArray().sort((a, b) => b.sizeBytes - a.sizeBytes),
    scanned,
    totalKeys,
  }
}
