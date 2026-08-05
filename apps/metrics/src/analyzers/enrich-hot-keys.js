import { Batch } from "@valkey/valkey-glide"

const PIPELINE_CHUNK_SIZE = 500

export const enrichHotKeys = (client) => async (hotKeyPairs) => {
  if (hotKeyPairs.length === 0) return []

  const results = []
  for (let i = 0; i < hotKeyPairs.length; i += PIPELINE_CHUNK_SIZE) {
    const chunk = hotKeyPairs.slice(i, i + PIPELINE_CHUNK_SIZE)
    const batch = new Batch(false)
    for (const [keyName] of chunk) {
      batch.customCommand(["TTL", keyName])
      batch.customCommand(["MEMORY", "USAGE", keyName])
    }
    try {
      const chunkResults = await client.exec(batch)
      results.push(...chunkResults)
    } catch {
      results.push(...chunk.flatMap(() => [-1, null]))
    }
  }

  return hotKeyPairs.map(([keyName, count], i) => {
    const ttl = results[i * 2] ?? -1
    const memoryUsage = results[i * 2 + 1] ?? null
    return [keyName, count, memoryUsage, ttl]
  })
}
