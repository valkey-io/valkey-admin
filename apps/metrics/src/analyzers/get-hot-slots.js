// Must have cluster-slot-stats-enabled set to yes
export const getHotSlots = async (client, limit = 50) => {
  try {
    const rawSlots = await client.customCommand([
      "CLUSTER", "SLOT-STATS", "ORDERBY", "CPU-USEC", "LIMIT", limit.toString(),
    ])

    return rawSlots
      .map(([slotId, slotStats]) => {
        // Find the cpu-usec object
        const cpuStat = slotStats.find((stat) => stat.key === "cpu-usec")
        if (!cpuStat || cpuStat.value <= 0) return null

        return { slotId, cpuUsec: cpuStat.value }
      })
      .filter(Boolean)
  } catch (error) {
    console.error("ERROR:", error)
    return []
  }
}

