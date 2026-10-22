import crypto from "node:crypto"
import type { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import type { ConnectionDetails } from "./actions/connection"
import type { ClusterNodeMap, MetricsServerMap } from "./metrics-orchestrator"

/**
 * Owner identity: the Valkey identity a connection authenticated as.
 *
 * Every piece of server state that holds a client, a collector or per-cluster
 * data is keyed by this value, so users who authenticate as different Valkey
 * users share nothing. The key is not secret and never grants access by
 * itself: reuse of an existing client is gated by a fresh AUTH.
 *
 * - password: `password~<username>`. Without a password Glide sends no
 *   credentials and the connection runs as `default`, whatever username the
 *   user typed, so the owner is `default` too.
 * - ElastiCache IAM: `iam~<region>~<replicationGroupId>~<username>`.
 * - GCP IAM: `gcp-iam~default` (the only user GCP IAM supports).
 */
export const ownerOf = (details: Pick<ConnectionDetails,
  "authType" | "username" | "password" | "awsRegion" | "awsReplicationGroupId">): string => {
  if (details.authType === "iam") {
    return ["iam", details.awsRegion ?? "", details.awsReplicationGroupId ?? "", details.username ?? ""].join("~")
  }
  if (details.authType === "gcp-iam") return "gcp-iam~default"
  const username = details.password && details.username ? details.username : "default"
  return `password~${username}`
}

const SAFE_BYTE = /^[a-z0-9_~-]$/
const MAX_OWNER_DIR_BYTES = 200
const TRUNCATED_PREFIX_BYTES = 180

/**
 * Encode an owner key as one directory name. Lowercase letters, digits, `_`,
 * `-` and `~` stay as they are. Every other UTF-8 byte, uppercase included,
 * becomes `%XX`, so names stay distinct on case-insensitive filesystems and
 * stay readable. Names longer than 200 bytes are cut and get a hash suffix
 * (`~h<16 hex>`), which is not reversible.
 */
export const encodeOwnerDir = (ownerKey: string): string => {
  const encoded = [...Buffer.from(ownerKey, "utf8")]
    .map((byte) => {
      const char = String.fromCharCode(byte)
      return SAFE_BYTE.test(char) ? char : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
    })
    .join("")
  if (encoded.length <= MAX_OWNER_DIR_BYTES) return encoded
  const hash = crypto.createHash("sha256").update(ownerKey, "utf8").digest("hex").slice(0, 16)
  return `${encoded.slice(0, TRUNCATED_PREFIX_BYTES)}~h${hash}`
}

export const decodeOwnerDir = (dir: string): string => decodeURIComponent(dir)

type ClientEntry = { client: GlideClient | GlideClusterClient; clusterId?: string }

/** All server state that belongs to one owner identity. */
export type OwnerState = {
  ownerKey: string
  /** True for the identity configured through `VALKEY_*` environment variables. */
  env: boolean
  clients: Map<string, ClientEntry>
  clusterNodesRegistry: Map<string, ClusterNodeMap>
  clusterCredentials: Map<string, string | undefined>
  metricsServerMap: MetricsServerMap
  /** HMAC key material for this owner's spawned collectors, keyed by metrics-node-id. */
  collectorKeys: Map<string, string>
  inFlightClusterClients: Map<string, Promise<GlideClusterClient>>
  connectInFlight: Map<string, Promise<GlideClient | GlideClusterClient | undefined>>
}

export const createOwnerState = (ownerKey: string, env = false): OwnerState => ({
  ownerKey,
  env,
  clients: new Map(),
  clusterNodesRegistry: new Map(),
  clusterCredentials: new Map(),
  metricsServerMap: new Map(),
  collectorKeys: new Map(),
  inFlightClusterClients: new Map(),
  connectInFlight: new Map(),
})

/**
 * The env owner's state. It also backs the module-level maps exported by
 * `metrics-orchestrator.ts`, which the preconfigured and Kubernetes paths use.
 * A user reaches it only when they authenticate as the preconfigured identity.
 */
const envState = createOwnerState("env", true)
const owners = new Map<string, OwnerState>()

export const getEnvOwnerState = (): OwnerState => envState

/** Make the preconfigured identity resolve to the env owner's state. */
export const registerEnvOwner = (ownerKey: string): void => {
  owners.delete(envState.ownerKey)
  envState.ownerKey = ownerKey
  owners.set(ownerKey, envState)
}

export const getOwnerState = (ownerKey: string): OwnerState => {
  let state = owners.get(ownerKey)
  if (!state) {
    state = createOwnerState(ownerKey)
    owners.set(ownerKey, state)
  }
  return state
}

/** Every owner state, the env owner's included. */
export const allOwnerStates = (): OwnerState[] => {
  const states = [...owners.values()]
  return states.includes(envState) ? states : [envState, ...states]
}
