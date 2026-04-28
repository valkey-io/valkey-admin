export const WS_URL = "ws://localhost:8080"

/**
 * Values match the ACL user in `tools/valkey-cluster/scripts/cluster_init.sh`.
 */
export const defaultConnectionDetails = () => {
  return {
    host: "valkey-7001",
    port: "7001",
    username: "appuser",
    password: "admin",
    tls: false,
    verifyTlsCertificate: false,
    endpointType: "node" as const,
  }
}
