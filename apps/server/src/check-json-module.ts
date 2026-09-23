import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"

// Probe JSON commands directly for compatibility with services like ElastiCache,
// where JSON may be available even though MODULE commands are unsupported.
export async function checkJsonModuleAvailability(
  client: GlideClient | GlideClusterClient,
  connectionId: string,
): Promise<boolean> {
  let available: boolean
  try {
    const reply = await client.customCommand(["COMMAND", "INFO", "JSON.TYPE"])
    available = Array.isArray(reply) && reply[0] != null
  } catch {
    // Fallback for servers that restrict COMMAND
    try {
      await client.customCommand(["JSON.TYPE", "nonexistent_key"])
      available = true
    } catch {
      available = false
    }
  }

  console.log(`JSON module ${available ? "available" : "not available"} for ${connectionId}`)
  return available
}
