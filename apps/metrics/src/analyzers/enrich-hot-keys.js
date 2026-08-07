import { Batch } from "@valkey/valkey-glide"
import { VALKEY_CLIENT } from "../../../../common/src/constants.js"

const { PIPELINE_CHUNK_SIZE } = VALKEY_CLIENT

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
    const [ttl, memoryUsage] = results.slice(i * 2, i * 2 + 2)
    return [keyName, count, memoryUsage ?? null, ttl ?? -1]
  })
}
