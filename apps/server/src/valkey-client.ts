import { GlideClient, GlideClusterClient, NodeDiscoveryMode, type ServerCredentials } from "@valkey/valkey-glide"

type Address = {
  host: string
  port: number
}

type ClientOptions = {
  addresses: Address[]
  credentials?: ServerCredentials
  useTLS: boolean
  verifyTlsCertificate: boolean
  databaseId?: number
}

const buildSharedOptions = ({
  addresses,
  credentials,
  useTLS,
  verifyTlsCertificate,
  databaseId,
}: ClientOptions) => ({
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
    ...(useTLS && verifyTlsCertificate === false && {
      tlsAdvancedConfiguration: {
        insecure: true,
      },
    }),
    connectionTimeout: 30000,
  },
  requestTimeout: 5000,
})

export const createStandaloneValkeyClient = ({
  ...options
}: ClientOptions) =>
  GlideClient.createClient({
    ...buildSharedOptions(options),
    clientName: "valkey_admin_standalone_client",
    nodeDiscoveryMode: NodeDiscoveryMode.Static
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
    nodeDiscoveryMode: NodeDiscoveryMode.Static
  })
