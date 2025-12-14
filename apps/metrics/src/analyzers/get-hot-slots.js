export const getHotSlots = async (client, limit = 50) => {
  try {
    const rawSlots = await client.sendCommand([
      "CLUSTER", "SLOT-STATS", "ORDERBY", "CPU-USEC", "LIMIT", limit.toString(),
    ])

    return rawSlots
      .map((slot) => {
        const slotId = slot[0]
        const slotStats = slot[1]
        const idx = slotStats.indexOf("cpu-usec")
        if (idx === -1) return null

        const cpuUsec = Number(slotStats[idx + 1])
        return cpuUsec > 0 ? { slotId, cpuUsec } : null
      })
      .filter(Boolean)
  } catch (error) {
    console.error(
      "ERROR:",
      error,
    )
    return []
  }
}

