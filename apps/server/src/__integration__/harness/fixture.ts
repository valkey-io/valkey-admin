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
    db: 0,
  }
}

export const defaultStandaloneConnectionDetails = (db: number = 0) => {
  return {
    host: "valkey-standalone",
    port: "6379",
    tls: false,
    verifyTlsCertificate: false,
    endpointType: "node" as const,
    db,
  }
}

/**
 * A second ACL user with every command except `ACL` and `COMMANDLOG`. Created
 * on the cluster nodes by `cluster_init.sh` and on the standalone node by its
 * `--user` arguments in `docker/docker-compose.test.yml`.
 */
export const RESTRICTED_USER = { username: "restricted", password: "restricted" }

export const restrictedClusterConnectionDetails = () => ({
  ...defaultConnectionDetails(),
  ...RESTRICTED_USER,
})

export const standaloneConnectionDetailsAs = (
  user: { username: string; password: string },
  db: number = 0,
) => ({
  ...defaultStandaloneConnectionDetails(db),
  ...user,
})
