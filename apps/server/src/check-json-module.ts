import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"

// Probe JSON commands directly for compatibility with services like ElastiCache,
// where JSON may be available even though MODULE commands are unsupported.
async function checkJsonModule(client: GlideClient | GlideClusterClient): Promise<boolean> {
  try {
    const reply = await client.customCommand(["COMMAND", "INFO", "JSON.TYPE"])
    return Array.isArray(reply) && reply[0] != null
  } catch {
    try {
      await client.customCommand(["JSON.TYPE", "nonexistent_key"])
      return true
    } catch {
      return false
    }
  }
}

export async function checkJsonModuleAvailability(
  client: GlideClient | GlideClusterClient,
  connectionId: string,
): Promise<boolean> {
  const available = await checkJsonModule(client)

  console.log(`JSON module ${available ? "available" : "not available"} for ${connectionId}`)
  return available
}
