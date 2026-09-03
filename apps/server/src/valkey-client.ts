import { GlideClient, GlideClusterClient, NodeDiscoveryMode, type ServerCredentials } from "@valkey/valkey-glide"
import { readFileSync } from "node:fs"

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
        ? { rootCertificates: readFileSync(caCertPath) }
        : undefined

  return {
    addresses,
    credentials,
    useTLS,
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
