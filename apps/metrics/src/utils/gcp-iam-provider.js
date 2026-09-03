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
    const token = await this.#auth.getAccessToken()
    if (!token) {
      throw new Error("Unable to mint a GCP access token from Application Default Credentials")
    }
    return token
  }
}

export { GcpIAMProvider }
