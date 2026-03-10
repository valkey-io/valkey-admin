import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"

type ModuleAttribute = {
  key: string
  value: unknown
}

type Module = ModuleAttribute[]

export async function checkJsonModuleAvailability(
  client: GlideClient | GlideClusterClient,
): Promise<boolean> {
  try {
    const modules = await client.customCommand(["MODULE", "LIST"]) as Module[]

    return modules.some((module) => {
      const moduleName = module.find((attr) => attr.key === "name")?.value

      return typeof moduleName === "string" &&
             (moduleName.toLowerCase().includes("json") ||
              moduleName.toLowerCase().includes("rejson"))
    })
  } catch (err) {
    console.error("Error checking JSON module availability:", err)
    return false
  }
}
