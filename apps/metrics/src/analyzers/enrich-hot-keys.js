import { Batch } from "@valkey/valkey-glide"

export const enrichHotKeys = (client) => async (hotKeyPairs) => {
  if (hotKeyPairs.length === 0) return []

  const batch = new Batch(false)
  for (const [keyName] of hotKeyPairs) {
    batch.customCommand(["TTL", keyName])
    batch.customCommand(["MEMORY", "USAGE", keyName])
  }

  let results
  try {
    results = await client.exec(batch)
  } catch {
    return hotKeyPairs.map(([keyName, count]) => [keyName, count, null, -1])
  }

  return hotKeyPairs.map(([keyName, count], i) => {
    const ttl = results[i * 2] ?? -1
    const memoryUsage = results[i * 2 + 1] ?? null
    return [keyName, count, memoryUsage, ttl]
  })
}
