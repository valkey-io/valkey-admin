import { GlideClient, GlideClusterClient, ServiceType } from "@valkey/valkey-glide"

const SUPPORTED_VALKEY_MODES = new Set(["standalone", "cluster"])

export const getValkeyMode = (cfg = {}) => {
  const configuredMode = process.env.VALKEY_MODE ?? cfg?.valkey?.mode ?? "standalone"
  const normalizedMode = String(configuredMode).trim().toLowerCase()

  if (!SUPPORTED_VALKEY_MODES.has(normalizedMode)) {
    throw new Error(`Unsupported VALKEY_MODE: ${configuredMode}`)
  }

  return normalizedMode
}

export const createValkeyClient = async (cfg = {}) => {
  const addresses = [
    {
      host: process.env.VALKEY_HOST,
      port: Number(process.env.VALKEY_PORT),
    },
  ]
  const credentials =
    process.env.VALKEY_AUTH_TYPE === "iam"
      ? {
        username: process.env.VALKEY_USERNAME,
        iamConfig: {
          clusterName: process.env.VALKEY_REPLICATION_GROUP_ID,
          service: ServiceType.Elasticache,
          region: process.env.VALKEY_AWS_REGION,
        },
      }
      : process.env.VALKEY_PASSWORD ? {
        username: process.env.VALKEY_USERNAME,
        password: process.env.VALKEY_PASSWORD,
      } : undefined

  const useTLS = process.env.VALKEY_TLS === "true"
  const sharedOptions = {
    addresses,
    credentials,
    useTLS,
    advancedConfiguration: {
      ...(useTLS && process.env.VALKEY_VERIFY_CERT === "false" && {
        tlsAdvancedConfiguration: {
          insecure: true,
        },
      }),
      connectionTimeout: 30000,
    },
    requestTimeout: 5000,
  }

  const mode = getValkeyMode(cfg)
  return mode === "cluster"
    ? GlideClusterClient.createClient({
      ...sharedOptions,
      clientName: "valkey_admin_metrics_cluster_client",
    })
    : GlideClient.createClient({
      ...sharedOptions,
      clientName: "valkey_admin_metrics_standalone_client",
    })
}
