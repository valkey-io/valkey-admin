import { GlideClient, GlideClusterClient, NodeDiscoveryMode, type ServerCredentials } from "@valkey/valkey-glide"
import { readFileSync, statSync } from "node:fs"
import { APP_VERSION, deploymentSuffix } from "valkey-common"

type Address = {
  host: string
  port: number
}

type ClientOptions = {
  addresses: Address[]
  credentials?: ServerCredentials
  useTLS: boolean
  verifyTlsCertificate: boolean
  caCertPath?: string
  databaseId?: number
}

const clientInfoTag = `valkey-admin-${deploymentSuffix()}:${APP_VERSION}`

// A connection's `caCertPath` can originate from a client-supplied connection
// request, so guard the synchronous read: reject non-regular files (FIFOs or
// devices that would block the event loop) and oversized files before reading.
const MAX_CA_CERT_BYTES = 1024 * 1024

const readCaCertificate = (caCertPath: string): Buffer => {
  const stats = statSync(caCertPath)
  if (!stats.isFile()) {
    throw new Error(`CA certificate path is not a regular file: ${caCertPath}`)
  }
  if (stats.size > MAX_CA_CERT_BYTES) {
    throw new Error(
      `CA certificate file exceeds ${MAX_CA_CERT_BYTES} bytes (${stats.size}): ${caCertPath}`,
    )
  }
  return readFileSync(caCertPath)
}

const buildSharedOptions = ({
  addresses,
  credentials,
  useTLS,
  verifyTlsCertificate,
  caCertPath,
  databaseId,
}: ClientOptions) => {
  // Surface any insecure TLS connection: disabling certificate validation exposes the
  // connection to MITM, so it must never happen silently (see #445).
  if (useTLS && verifyTlsCertificate === false) {
    console.warn(
      "WARNING: TLS certificate validation is DISABLED (insecure: true). "
        + "The connection is vulnerable to man-in-the-middle attacks. "
        + "Set VALKEY_VERIFY_CERT=true (or enable certificate verification) to secure it.",
    )
  }

  // Glide's TLS runs in its Rust core, so a private CA (the connection's
  // `caCertPath`) must be passed via `rootCertificates`; Node's trust store
  // and NODE_EXTRA_CA_CERTS do not apply.
  const tlsAdvancedConfiguration = !useTLS
    ? undefined
    : verifyTlsCertificate === false
      ? { insecure: true }
      : caCertPath
        ? { rootCertificates: readCaCertificate(caCertPath) }
        : undefined

  return {
    addresses,
    credentials,
    useTLS,
    clientInfoTag,
    // Only forward `databaseId` when it's a non-zero integer. Glide issues a
    // `SELECT` on the connection whenever `databaseId` is set, and cluster
    // nodes reject `SELECT` (even `SELECT 0`). DB 0 is the default at the
    // server side, so omitting it here is equivalent for standalone and
    // mandatory for cluster.
    ...(typeof databaseId === "number" && databaseId > 0 && { databaseId }),
    advancedConfiguration: {
      ...(tlsAdvancedConfiguration && { tlsAdvancedConfiguration }),
      connectionTimeout: 30000,
    },
    requestTimeout: 5000,
  }
}

export const createStandaloneValkeyClient = ({
  ...options
}: ClientOptions) =>
  GlideClient.createClient({
    ...buildSharedOptions(options),
    clientName: "valkey_admin_standalone_client",
    nodeDiscoveryMode: NodeDiscoveryMode.Static,
  })

export const createClusterValkeyClient = ({
  ...options
}: ClientOptions) =>
  GlideClusterClient.createClient({
    ...buildSharedOptions(options),
    clientName: "valkey_admin_cluster_client",
  })

export const createOrchestratorValkeyClient = ({
  ...options
}: ClientOptions) =>
  GlideClient.createClient({
    ...buildSharedOptions(options),
    clientName: "valkey_admin_orchestrator_client",
    nodeDiscoveryMode: NodeDiscoveryMode.Static,
  })
