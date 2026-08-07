import { Heap } from "heap-js"
import { Batch } from "@valkey/valkey-glide"
import { VALKEY_CLIENT } from "../../../../common/src/constants.js"

export const scanBigKeys = async (client, { scanLimit = 10000, topN = 50, batchSize = VALKEY_CLIENT.PIPELINE_CHUNK_SIZE } = {}) => {
  const heap = new Heap((a, b) => a.sizeBytes - b.sizeBytes)

  const totalKeys = Number(await client.customCommand(["DBSIZE"]))

  let cursor = "0"
  let scanned = 0

  do {
    const [nextCursor, keys] = await client.customCommand(["SCAN", cursor, "COUNT", batchSize.toString()])
    cursor = nextCursor

    if (keys.length === 0) continue

    // Pipeline all per-key commands in a single round trip
    const batch = new Batch(false)
    for (const key of keys) {
      batch.customCommand(["MEMORY", "USAGE", key, "SAMPLES", "5"])
      batch.customCommand(["TYPE", key])
      batch.customCommand(["TTL", key])
    }
    const results = await client.exec(batch)

    for (let i = 0; i < keys.length; i++) {
      const [sizeBytes, type, ttl] = results.slice(i * 3, i * 3 + 3)
      const entry = { key: keys[i], sizeBytes: Number(sizeBytes), type, ttl: Number(ttl) }

      if (heap.size() < topN) {
        heap.push(entry)
      } else if (entry.sizeBytes > heap.peek().sizeBytes) {
        heap.pop()
        heap.push(entry)
      }

      scanned++
    }
    // scanLimit controls how many keys are scanned, not how many are returned
  } while (cursor !== "0" && scanned < scanLimit)

  // topN keys returned in descending order of sizeBytes
  const topKeys = heap.toArray().sort((a, b) => b.sizeBytes - a.sizeBytes)

  // Pipeline OBJECT FREQ for all top keys
  const freqBatch = new Batch(false)
  for (const entry of topKeys) {
    freqBatch.customCommand(["OBJECT", "FREQ", entry.key])
  }

  let freqResults
  try {
    freqResults = await client.exec(freqBatch)
  } catch {
    freqResults = null
  }

  const keys = topKeys.map((entry, i) => {
    const freq = Number(freqResults?.[i])
    return { ...entry, freq: Number.isNaN(freq) ? null : freq }
  })

  return { keys, scanned, totalKeys, scannedAt: Date.now() }
}
