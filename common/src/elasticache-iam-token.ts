import { SignatureV4 } from "@smithy/signature-v4"
import { HttpRequest } from "@smithy/protocol-http"
import { defaultProvider } from "@aws-sdk/credential-provider-node"
import { formatUrl } from "@aws-sdk/util-format-url"
import { Sha256 } from "@aws-crypto/sha256-js"

// An ElastiCache IAM auth token is valid for 15 minutes.
const TOKEN_EXPIRES_IN_SECONDS = 900

/**
 * Sign an ElastiCache IAM auth token for `user` on `replicationGroupId`. Send
 * the token as the AUTH password, with `user` as the username.
 *
 * The token is a SigV4 presigned `connect` request, signed with the process's
 * AWS credentials from the default provider chain. Glide signs its own token
 * inside its native core. This signer is for the connections that do not use
 * Glide: the metrics collector's MONITOR stream and the server's AUTH probe.
 * Send the token only over verified TLS (`assertIamTransport`).
 */
export async function signElastiCacheIamToken(
  user: string,
  replicationGroupId: string,
  region = "us-east-1",
): Promise<string> {
  const credentials = await defaultProvider()()

  const signer = new SignatureV4({
    service: "elasticache",
    credentials,
    region,
    sha256: Sha256,
  })

  const url = new URL(`https://${replicationGroupId}/`)
  url.searchParams.append("Action", "connect")
  url.searchParams.append("User", user)

  const request = new HttpRequest({
    protocol: url.protocol,
    hostname: url.hostname,
    method: "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: {
      host: url.hostname,
    },
  })

  const signedRequest = await signer.presign(request, { expiresIn: TOKEN_EXPIRES_IN_SECONDS })
  return formatUrl(signedRequest).replace(/^https?:\/\//, "")
}
