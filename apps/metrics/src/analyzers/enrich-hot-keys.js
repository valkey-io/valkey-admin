export const enrichHotKeys = (client) => async (hotKeyPairs) => {
  return Promise.all(
    hotKeyPairs.map(async ([keyName, count]) => {
      try {
        const [ttl, memoryUsage] = await Promise.all([
          client.customCommand(["TTL", keyName]).catch(() => -1),
          client.customCommand(["MEMORY", "USAGE", keyName]).catch(() => null),
        ])

        // Keep the same shape as before: [keyName, count, size, ttl]
        return [keyName, count, memoryUsage ?? null, ttl ?? -1]
      } catch (error) {
        console.error(`Error fetching data for the key ${keyName}:`, error)
        return [keyName, count, null, -1]
      }
    }),
  )
}
