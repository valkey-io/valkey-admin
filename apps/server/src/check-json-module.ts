import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"

export async function checkJsonModuleAvailability(
  client: GlideClient | GlideClusterClient,
): Promise<boolean> {
  try {
    await client.customCommand(["JSON.TYPE", "nonexistent_key"])
    return true
  } catch {
    return false
  }
}

