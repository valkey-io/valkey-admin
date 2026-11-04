/**
 * Transport rules for IAM authentication.
 *
 * With `iam` (ElastiCache) and `gcp-iam` (Memorystore), the server signs or
 * mints a credential from its own cloud identity and sends it as the AUTH
 * password to the host the client named. The rules here bound where that
 * credential can go:
 *
 * - Both need TLS with certificate verification, so a plain TCP listener or a
 *   man in the middle cannot read the credential.
 * - `gcp-iam` also needs a CA file (`VALKEY_CA_CERT_PATH`). Glide uses that
 *   file as the only trust root, so the token reaches only a server with a
 *   certificate from the operator's CA. Without it, any host with a publicly
 *   trusted certificate would receive a bearer token with the
 *   `cloud-platform` scope.
 *
 * The rule does not depend on the deployment mode.
 */

export const CA_CERT_PATH_ENV = "VALKEY_CA_CERT_PATH"

export type IamAuthType = "password" | "iam" | "gcp-iam"

export interface IamTransport {
  authType?: IamAuthType | string
  tls: boolean
  verifyTlsCertificate: boolean
}

export class IamTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IamTransportError"
  }
}

/**
 * Throw `IamTransportError` when `transport` is not safe for `authType`.
 * `caCertPath` is the operator's CA file path, normally
 * `process.env.VALKEY_CA_CERT_PATH`. An empty string counts as missing.
 */
export function assertIamTransport(transport: IamTransport, caCertPath: string | undefined): void {
  const { authType, tls, verifyTlsCertificate } = transport
  if (authType === "gcp-iam") {
    if (!tls) {
      throw new IamTransportError("GCP IAM authentication requires TLS. Set VALKEY_TLS=true.")
    }
    if (verifyTlsCertificate === false) {
      throw new IamTransportError(
        "GCP IAM authentication requires TLS certificate verification. "
          + `Do not disable VALKEY_VERIFY_CERT; provide the server CA via ${CA_CERT_PATH_ENV} instead.`,
      )
    }
    if (!caCertPath) {
      throw new IamTransportError(
        `GCP IAM authentication requires ${CA_CERT_PATH_ENV}, so the access token is sent only to your `
          + "Memorystore instance. Point it at the instance's server CA file.",
      )
    }
    return
  }
  if (authType === "iam") {
    if (!tls || verifyTlsCertificate === false) {
      throw new IamTransportError(
        "AWS IAM authentication requires TLS with certificate verification. "
          + "ElastiCache requires in-transit encryption for IAM, so enable TLS and keep verification on.",
      )
    }
  }
}
