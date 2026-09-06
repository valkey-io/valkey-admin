import { GoogleAuth } from "google-auth-library"

// GCP Memorystore for Valkey IAM auth uses a short-lived OAuth2 access token as the AUTH password.
// We mint the token from Application Default Credentials (Workload Identity in GKE,
// the metadata server on Google Compute Engine, or GOOGLE_APPLICATION_CREDENTIALS locally).
class GcpIAMProvider {
  #auth

  constructor() {
    this.#auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    })
  }

  async getCredentials() {
    // The token is an OAuth2 bearer credential; refuse to mint it for a transport
    // that could leak it (plaintext, or TLS without certificate verification).
    if (process.env.VALKEY_TLS !== "true") {
      throw new Error("GCP IAM authentication requires TLS. Set VALKEY_TLS=true.")
    }
    if (process.env.VALKEY_VERIFY_CERT === "false") {
      throw new Error(
        "GCP IAM authentication requires TLS certificate verification. "
          + "Do not disable VALKEY_VERIFY_CERT; provide the server CA via VALKEY_CA_CERT_PATH instead.",
      )
    }
    const token = await this.#auth.getAccessToken()
    if (!token) {
      throw new Error("Unable to mint a GCP access token from Application Default Credentials")
    }
    return token
  }
}

export { GcpIAMProvider }
