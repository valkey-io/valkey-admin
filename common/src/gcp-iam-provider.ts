import { GoogleAuth } from "google-auth-library"
import { assertIamTransport } from "./iam-transport"

// GCP Memorystore for Valkey IAM auth uses a short-lived OAuth2 access token as the AUTH password.
// We mint the token from Application Default Credentials (Workload Identity in GKE,
// the metadata server on Google Compute Engine, or GOOGLE_APPLICATION_CREDENTIALS locally).
const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
})

// The token is an OAuth2 bearer credential; refuse to mint it for a transport
// that could leak it. `caCertPath` is the operator's CA file (normally
// VALKEY_CA_CERT_PATH); it is required, see `assertIamTransport`.
export async function mintGcpAccessToken(
  useTLS: boolean,
  verifyTlsCertificate: boolean,
  caCertPath: string | undefined,
): Promise<string> {
  assertIamTransport({ authType: "gcp-iam", tls: useTLS, verifyTlsCertificate }, caCertPath)
  const token = await auth.getAccessToken()
  if (!token) {
    throw new Error("Unable to mint a GCP access token from Application Default Credentials")
  }
  return token
}
