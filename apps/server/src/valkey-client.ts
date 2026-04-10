import { GlideClient, GlideClusterClient, type ServerCredentials } from "@valkey/valkey-glide"

type Address = {
  host: string
  port: number
}

type ClientOptions = {
  addresses: Address[]
  credentials?: ServerCredentials
  useTLS: boolean
  verifyTlsCertificate: boolean
}

const buildSharedOptions = ({
  addresses,
  credentials,
  useTLS,
  verifyTlsCertificate,
}: ClientOptions) => ({
  addresses,
  credentials,
  useTLS,
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
    clientName: "valkey_server_standalone_client",
  })

export const createClusterValkeyClient = ({
  ...options
}: ClientOptions) =>
  GlideClusterClient.createClient({
    ...buildSharedOptions(options),
    clientName: "valkey_server_cluster_client",
  })

export const createOrchestratorValkeyClient = ({
  ...options
}: ClientOptions) =>
  GlideClusterClient.createClient({
    ...buildSharedOptions(options),
    clientName: "valkey_server_orchestrator_client",
  })
