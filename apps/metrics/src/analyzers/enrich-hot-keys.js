export const enrichHotKeys = (client) => async (hotKeyPairs) => {
    return Promise.all(
      hotKeyPairs.map(async ([keyName, count]) => {
        try {
          const [size, ttl] = await Promise.all([
            client.memoryUsage(keyName).catch(() => null),
            client.ttl(keyName).catch(() => -1)
          ])
          return [keyName, count, size, ttl]
        } catch (error) {
          console.error(`Error fetching data for the key ${keyName}:`, error)
          return [keyName, count, null, -1]
        }
      })
    )
  }