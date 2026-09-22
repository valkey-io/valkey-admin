import { GlideClient, ServiceType, NodeDiscoveryMode } from "@valkey/valkey-glide"
import { APP_VERSION ,deploymentSuffix } from "valkey-common"

const clientInfoTag = `valkey-admin-metrics-${deploymentSuffix()}:${APP_VERSION}`

// A collector samples exactly one node, so its client is always node-local. A
// cluster-wide client would route keyless commands (SCAN, CLUSTER SLOT-STATS) to
// an arbitrary node, which breaks per-node sampling.
const warnIfModeConfigured = (cfg = {}) => {
  const configuredMode = process.env.VALKEY_MODE ?? cfg?.valkey?.mode
  if (configuredMode && String(configuredMode).trim().toLowerCase() !== "standalone") {
    console.warn(
      `Ignoring VALKEY_MODE="${configuredMode}": the metrics collector always uses a node-local client.`,
    )
  }
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
    clientInfoTag,
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

  warnIfModeConfigured(cfg)
  return GlideClient.createClient({
    ...sharedOptions,
    clientName: "valkey_admin_metrics_standalone_client",
    nodeDiscoveryMode: NodeDiscoveryMode.Static,
  })
}
