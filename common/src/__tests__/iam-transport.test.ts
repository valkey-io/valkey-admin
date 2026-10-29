import { describe, it } from "node:test"
import assert from "node:assert"
import { assertIamTransport, IamTransportError } from "../iam-transport"

const ok = (fn: () => void) => assert.doesNotThrow(fn)
const refused = (fn: () => void, pattern: RegExp) =>
  assert.throws(fn, (err: unknown) => err instanceof IamTransportError && pattern.test(err.message))

describe("assertIamTransport", () => {
  it("accepts gcp-iam with TLS, verification and a CA path", () => {
    ok(() => assertIamTransport({ authType: "gcp-iam", tls: true, verifyTlsCertificate: true }, "/etc/ca.pem"))
  })

  it("refuses gcp-iam without TLS", () => {
    refused(() => assertIamTransport({ authType: "gcp-iam", tls: false, verifyTlsCertificate: true }, "/etc/ca.pem"), /requires TLS/)
  })

  it("refuses gcp-iam without certificate verification", () => {
    refused(
      () => assertIamTransport({ authType: "gcp-iam", tls: true, verifyTlsCertificate: false }, "/etc/ca.pem"),
      /certificate verification/,
    )
  })

  it("refuses gcp-iam without a CA path, and names the variable", () => {
    for (const caCertPath of [undefined, ""]) {
      refused(
        () => assertIamTransport({ authType: "gcp-iam", tls: true, verifyTlsCertificate: true }, caCertPath),
        /VALKEY_CA_CERT_PATH/,
      )
    }
  })

  it("refuses iam without TLS or without verification, and accepts it with both", () => {
    refused(() => assertIamTransport({ authType: "iam", tls: false, verifyTlsCertificate: true }, undefined), /AWS IAM.*TLS/)
    refused(() => assertIamTransport({ authType: "iam", tls: true, verifyTlsCertificate: false }, undefined), /AWS IAM.*TLS/)
    ok(() => assertIamTransport({ authType: "iam", tls: true, verifyTlsCertificate: true }, undefined))
  })

  it("does not check password auth", () => {
    ok(() => assertIamTransport({ authType: "password", tls: false, verifyTlsCertificate: false }, undefined))
    ok(() => assertIamTransport({ tls: false, verifyTlsCertificate: false }, undefined))
  })
})
