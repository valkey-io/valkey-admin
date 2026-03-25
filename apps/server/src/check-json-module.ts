import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"

export async function checkJsonModuleAvailability(
  client: GlideClient | GlideClusterClient,
): Promise<boolean> {
  try {
    // Elasticache restricts MODULE command
    await client.customCommand(["JSON.TYPE", "nonexistent_key"])
    return true
  } catch {
    return false
  }
}

