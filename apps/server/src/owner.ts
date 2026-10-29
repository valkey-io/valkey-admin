import crypto from "node:crypto"
import type { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import type { Endpoint } from "valkey-common"
import type { ConnectionDetails } from "./actions/connection"
import type { ClusterNodeMap, MetricsServerMap } from "./metrics-orchestrator"

export type IdentityDetails = Pick<ConnectionDetails,
  "authType" | "username" | "password" | "awsRegion" | "awsReplicationGroupId">

/**
 * Identity: the Valkey user a connection authenticates as, without the server.
 *
 * - password: `password~<username>`. Without a password Glide sends no
 *   credentials and the connection runs as `default`, whatever username the
 *   user typed, so the identity is `default` too.
 * - ElastiCache IAM: `iam~<region>~<replicationGroupId>~<username>`.
 * - GCP IAM: `gcp-iam~default` (the only user GCP IAM supports).
 */
export const identityOf = (details: IdentityDetails): string => {
  if (details.authType === "iam") {
    return ["iam", details.awsRegion ?? "", details.awsReplicationGroupId ?? "", details.username ?? ""].join("~")
  }
  if (details.authType === "gcp-iam") return "gcp-iam~default"
  const username = details.password && details.username ? details.username : "default"
  return `password~${username}`
}

/**
 * Owner key: one Valkey user on one Valkey deployment,
 * `<identity>@<host>:<port>` with the endpoint from `normalizeEndpoint`.
 *
 * Every piece of server state that holds a client, a collector or per-cluster
 * data is keyed by this value. The endpoint is the one the AUTH probe just
 * succeeded against, so an owner state can hold only resources that this
 * identity proved access to on this deployment. A user who authenticates as
 * `alice` against their own server never reaches `alice`'s state for another
 * server, whatever connectionId or clusterId they send. The key is not secret
 * and never grants access by itself: every connect runs a fresh AUTH.
 *
 * For a cluster, the endpoint is the seed of the owner's first connection to
 * that cluster. A later connection through another node joins that owner when
 * the join rule in `cluster-owner.ts` holds.
 */
export const ownerOf = (details: IdentityDetails, endpoint: Endpoint): string =>
  `${identityOf(details)}@${endpoint.host}:${endpoint.port}`

const splitOwnerKey = (ownerKey: string): { identity: string; seed: Endpoint | undefined } => {
  const at = ownerKey.lastIndexOf("@")
  const colon = ownerKey.lastIndexOf(":")
  if (at < 0 || colon < at) return { identity: ownerKey, seed: undefined }
  const port = Number(ownerKey.slice(colon + 1))
  if (!Number.isInteger(port)) return { identity: ownerKey, seed: undefined }
  return { identity: ownerKey.slice(0, at), seed: { host: ownerKey.slice(at + 1, colon), port } }
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

/** All server state that belongs to one owner: one Valkey user on one deployment. */
export type OwnerState = {
  ownerKey: string
  /** The identity part of the key (`identityOf`). Used to find candidate owners for a cluster join. */
  identity: string
  /**
   * The endpoint this owner first authenticated against. For a cluster owner
   * it is the seed node; the join rule checks that a new node's topology lists
   * it. Undefined only for the env owner before `registerEnvOwner` runs.
   */
  seed: Endpoint | undefined
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

/**
 * `identity` and `seed` default to the parts of `ownerKey` split at the last
 * `@`, or to the whole key with no seed when there is none. Production callers
 * pass them; the defaults keep test fixtures short.
 */
export const createOwnerState = (
  ownerKey: string,
  identity: string = splitOwnerKey(ownerKey).identity,
  seed: Endpoint | undefined = splitOwnerKey(ownerKey).seed,
  env = false,
): OwnerState => ({
  ownerKey,
  identity,
  seed,
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
const envState = createOwnerState("env", "env", undefined, true)
const owners = new Map<string, OwnerState>()

export const getEnvOwnerState = (): OwnerState => envState

/** Make the preconfigured identity on the preconfigured endpoint resolve to the env owner's state. */
export const registerEnvOwner = (details: IdentityDetails, seed: Endpoint): void => {
  owners.delete(envState.ownerKey)
  envState.ownerKey = ownerOf(details, seed)
  envState.identity = identityOf(details)
  envState.seed = seed
  owners.set(envState.ownerKey, envState)
}

/**
 * The owner's state if it exists. Does not create one: use this for any
 * request whose credentials Valkey has not accepted yet.
 */
export const findOwnerState = (ownerKey: string): OwnerState | undefined =>
  owners.get(ownerKey) ?? (envState.ownerKey === ownerKey ? envState : undefined)

/**
 * The owner's state, created on first use. Call it only after Valkey accepted
 * the owner's credentials, so unauthenticated requests cannot add entries.
 */
export function getOwnerState(details: IdentityDetails, seed: Endpoint): OwnerState
/** Test form: by raw owner key. Identity and seed are read from the key. */
export function getOwnerState(ownerKey: string): OwnerState
export function getOwnerState(detailsOrKey: IdentityDetails | string, seed?: Endpoint): OwnerState {
  const ownerKey = typeof detailsOrKey === "string" ? detailsOrKey : ownerOf(detailsOrKey, seed!)
  let state = findOwnerState(ownerKey)
  if (!state) {
    state = typeof detailsOrKey === "string"
      ? createOwnerState(ownerKey)
      : createOwnerState(ownerKey, identityOf(detailsOrKey), seed)
    owners.set(ownerKey, state)
  }
  return state
}

/** Every owner state with this identity, the env owner's included. */
export const ownerStatesWithIdentity = (identity: string): OwnerState[] =>
  allOwnerStates().filter((state) => state.identity === identity)

/**
 * Remove an owner's entry when the owner has nothing left on the server: no
 * client, no collector, no cluster topology and no connect in progress. The env
 * owner is never removed.
 */
export const removeOwnerStateIfUnused = (state: OwnerState): boolean => {
  if (state.env || owners.get(state.ownerKey) !== state) return false
  const unused = state.clients.size === 0
    && state.metricsServerMap.size === 0
    && state.clusterNodesRegistry.size === 0
    && state.connectInFlight.size === 0
    && state.inFlightClusterClients.size === 0
  if (unused) owners.delete(state.ownerKey)
  return unused
}

/** Every owner state, the env owner's included. */
export const allOwnerStates = (): OwnerState[] => {
  const states = [...owners.values()]
  return states.includes(envState) ? states : [envState, ...states]
}
