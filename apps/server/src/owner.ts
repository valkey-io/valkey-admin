import type { ConnectionDetails } from "./actions/connection"

/**
 * Owner identity: the Valkey identity a connection authenticated as.
 *
 * Every piece of server state that holds a client, a collector or per-cluster
 * data is keyed by this value, so users who authenticate as different Valkey
 * users share nothing. The key is not secret and never grants access by
 * itself: reuse of an existing client is gated by a fresh AUTH.
 *
 * - password: `password~<username>`. Without a password Glide sends no
 *   credentials and the connection runs as `default`, whatever username the
 *   user typed, so the owner is `default` too.
 * - ElastiCache IAM: `iam~<region>~<replicationGroupId>~<username>`.
 * - GCP IAM: `gcp-iam~default` (the only user GCP IAM supports).
 */
export const ownerOf = (details: ConnectionDetails): string => {
  if (details.authType === "iam") {
    return ["iam", details.awsRegion ?? "", details.awsReplicationGroupId ?? "", details.username ?? ""].join("~")
  }
  if (details.authType === "gcp-iam") return "gcp-iam~default"
  const username = details.password && details.username ? details.username : "default"
  return `password~${username}`
}
