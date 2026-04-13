import { SignatureV4 } from "@smithy/signature-v4"
import { HttpRequest } from "@smithy/protocol-http"
import { defaultProvider } from "@aws-sdk/credential-provider-node"
import { formatUrl } from "@aws-sdk/util-format-url"
import { Sha256 } from "@aws-crypto/sha256-js"

class ElastiCacheIAMProvider {
  #user
  #clusterName
  #region

  constructor(user, clusterName, region = "us-east-1") {
    this.#user = user
    this.#clusterName = clusterName
    this.#region = region
  }

  async getCredentials() {
    const credentials = await defaultProvider()()

    const signer = new SignatureV4({
      service: "elasticache",
      credentials,
      region: this.#region,
      sha256: Sha256,
    })

    const url = new URL(`https://${this.#clusterName}/`)
    url.searchParams.append("Action", "connect")
    url.searchParams.append("User", this.#user)

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

    const signedRequest = await signer.presign(request, { expiresIn: 900 })
    return formatUrl(signedRequest).replace(/^https?:\/\//, "")
  }
}

export { ElastiCacheIAMProvider }
