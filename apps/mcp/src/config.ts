// Configuration: validates the MCP server's environment variables and picks the
// Valkey connection for a request, from a configured target or its X-Valkey-* headers.
import { z } from "zod"
import { parseTargets, targetFromPath } from "./targets"

const portSchema = z.coerce.number().int().min(1).max(65535)

const envSchema = z.object({
  VALKEY_HOST: z.string().min(1).default("localhost"),
  VALKEY_PORT: portSchema.default(6379),
  VALKEY_USERNAME: z.string().min(1).optional(),
  VALKEY_PASSWORD: z.string().min(1).optional(),
  VALKEY_TLS: z.enum(["true", "false"]).default("false"),
  VALKEY_ADMIN_URL: z.url({ protocol: /^wss?$/ }).default("ws://localhost:8080"),
  VALKEY_ADMIN_MCP_ORIGIN: z.url().default("valkey-admin-mcp://localhost"),
  VALKEY_ADMIN_WS_TOKEN: z.string().min(1).optional(),
  VALKEY_ADMIN_MCP_PORT: portSchema.default(8081),
  VALKEY_ADMIN_MCP_TOKEN: z.string().min(32).optional(),
  VALKEY_ADMIN_MCP_TARGETS: z.string().optional(),
  VALKEY_ADMIN_MCP_USERNAME: z.string().min(1).optional(),
  VALKEY_ADMIN_MCP_PASSWORD: z.string().min(1).optional(),
})

const headerSchema = z.object({
  "x-valkey-host": z.string().min(1).default("localhost"),
  "x-valkey-port": portSchema.default(6379),
  "x-valkey-username": z.string().min(1).optional(),
  "x-valkey-password": z.string().min(1).optional(),
  "x-valkey-tls": z.enum(["true", "false"]).default("false"),
})

const HEADER_PREFIX = "x-valkey-"
export const MCP_PATH = "/mcp"

export type ConnectionConfig = {
  host: string
  port: number
  username?: string
  password?: string
  useTLS: boolean
}

export type AdminEndpoint = {
  url: string
  origin: string
  token?: string
}

export type Config = {
  connection: ConnectionConfig
  admin: AdminEndpoint
  mcpPort: number
  token?: string
  targets?: Map<string, ConnectionConfig>
}

// Names the fields that failed validation, for the error message.
const invalidFields = (error: z.ZodError) => error.issues.map((issue) => issue.path.join(".")).join(", ")

// Reads the environment, applying defaults for unset variables. Throws if any value is invalid.
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid configuration: ${invalidFields(result.error)}`)
  }
  const data = result.data
  return {
    connection: {
      host: data.VALKEY_HOST,
      port: data.VALKEY_PORT,
      username: data.VALKEY_USERNAME,
      password: data.VALKEY_PASSWORD,
      useTLS: data.VALKEY_TLS === "true",
    },
    admin: {
      url: data.VALKEY_ADMIN_URL,
      origin: data.VALKEY_ADMIN_MCP_ORIGIN,
      token: data.VALKEY_ADMIN_WS_TOKEN,
    },
    mcpPort: data.VALKEY_ADMIN_MCP_PORT,
    token: data.VALKEY_ADMIN_MCP_TOKEN,
    targets: data.VALKEY_ADMIN_MCP_TARGETS === undefined
      ? undefined
      : parseTargets(data.VALKEY_ADMIN_MCP_TARGETS, {
        username: data.VALKEY_ADMIN_MCP_USERNAME,
        password: data.VALKEY_ADMIN_MCP_PASSWORD,
      }),
  }
}

export const hasValkeyHeaders = (names: Iterable<string>) =>
  [...names].some((name) => name.toLowerCase().startsWith(HEADER_PREFIX))

export const isServedPath = ({ targets }: Config, pathname: string) =>
  targets ? targets.has(targetFromPath(pathname) ?? "") : pathname === MCP_PATH

export const connectionForRequest = (config: Config, pathname: string, headers: Headers | undefined) => {
  if (!config.targets) return connectionFromHeaders(headers, config.connection)
  const target = config.targets.get(targetFromPath(pathname) ?? "")
  if (!target) throw new Error(`No MCP target is served at ${pathname}`)
  return target
}

// Picks the Valkey connection for a request. With no X-Valkey-* headers it
// returns the fallback from the environment. With any of them, the headers
// replace the fallback completely and unset headers use the schema defaults.
export const connectionFromHeaders = (headers: Headers | undefined, fallback: ConnectionConfig): ConnectionConfig => {
  const valkeyHeaders = Object.fromEntries(
    [...(headers?.entries() ?? [])].filter(([name]) => name.startsWith(HEADER_PREFIX)),
  )
  if (Object.keys(valkeyHeaders).length === 0) return fallback
  const result = headerSchema.safeParse(valkeyHeaders)
  if (!result.success) {
    throw new Error(`Invalid Valkey headers: ${invalidFields(result.error)}`)
  }
  const data = result.data
  return {
    host: data["x-valkey-host"],
    port: data["x-valkey-port"],
    username: data["x-valkey-username"],
    password: data["x-valkey-password"],
    useTLS: data["x-valkey-tls"] === "true",
  }
}
