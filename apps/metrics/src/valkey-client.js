import { GlideClient, GlideClusterClient, ServiceType, NodeDiscoveryMode } from "@valkey/valkey-glide"
import { readFileSync } from "node:fs"
import { APP_VERSION ,deploymentSuffix, mintGcpAccessToken } from "valkey-common"

const clientInfoTag = `valkey-admin-metrics-${deploymentSuffix()}:${APP_VERSION}`

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
  const useTLS = process.env.VALKEY_TLS === "true"
  const verifyTlsCertificate = process.env.VALKEY_VERIFY_CERT !== "false"
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
      : process.env.VALKEY_AUTH_TYPE === "gcp-iam"
        ? {
          // "default" is the only supported username for GCP IAM authentication
          // https://docs.cloud.google.com/memorystore/docs/valkey/manage-iam-auth#error-messages
          // mintGcpAccessToken rejects non-TLS / unverified transports for this bearer token.
          username: "default",
          password: await mintGcpAccessToken(useTLS, verifyTlsCertificate),
        }
        : process.env.VALKEY_PASSWORD ? {
          username: process.env.VALKEY_USERNAME,
          password: process.env.VALKEY_PASSWORD,
        } : undefined

  // Glide's TLS runs in its Rust core, so a custom CA must be passed explicitly
  // via `rootCertificates` (Node's trust store / NODE_EXTRA_CA_CERTS do not apply).
  const caCertPath = process.env.VALKEY_CA_CERT_PATH
  const tlsAdvancedConfiguration = !useTLS
    ? undefined
    : process.env.VALKEY_VERIFY_CERT === "false"
      ? { insecure: true }
      : caCertPath
        ? { rootCertificates: readFileSync(caCertPath) }
        : undefined
  const sharedOptions = {
    addresses,
    credentials,
    useTLS,
    clientInfoTag,
    advancedConfiguration: {
      ...(tlsAdvancedConfiguration && { tlsAdvancedConfiguration }),
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
      nodeDiscoveryMode: NodeDiscoveryMode.Static,
    })
}
