import { LOCAL_STORAGE } from "@common/src/constants"
import { persistConnections } from "./valkeyEpics"
import type { ConnectionState } from "@/state/valkey-features/connection/connectionSlice"

// persistConnections is the single write path to localStorage. Its security job:
// never write a password that could not be encrypted (isPasswordEncrypted === false).
describe("persistConnections", () => {
  beforeEach(() => localStorage.clear())

  const read = () => JSON.parse(localStorage.getItem(LOCAL_STORAGE.VALKEY_CONNECTIONS) ?? "{}")

  const conn = (overrides: Partial<ConnectionState>): ConnectionState => ({
    status: "NOT_CONNECTED" as ConnectionState["status"],
    errorMessage: null,
    searchableText: "",
    connectionDetails: {
      host: "h", port: "6379", tls: false, verifyTlsCertificate: false, endpointType: "node", db: 0,
      password: "secret",
    },
    ...overrides,
  })

  it("strips the password and drops the flag when the password is unencrypted", () => {
    persistConnections({ a: conn({ isPasswordEncrypted: false }) })

    const stored = read().a
    expect(stored.connectionDetails.password).toBeUndefined()
    expect("isPasswordEncrypted" in stored).toBe(false)
  })

  it("preserves an encrypted password (flag true)", () => {
    persistConnections({ a: conn({ isPasswordEncrypted: true, connectionDetails: {
      host: "h", port: "6379", tls: false, verifyTlsCertificate: false, endpointType: "node", db: 0,
      password: "ciphertext",
    } }) })

    expect(read().a.connectionDetails.password).toBe("ciphertext")
  })

  it("preserves a password when the flag is absent (existing/normal connections)", () => {
    persistConnections({ a: conn({}) })
    expect(read().a.connectionDetails.password).toBe("secret")
  })

  it("only strips the flagged connection, leaving others intact", () => {
    persistConnections({
      bad: conn({ isPasswordEncrypted: false }),
      good: conn({ isPasswordEncrypted: true, connectionDetails: {
        host: "g", port: "6379", tls: false, verifyTlsCertificate: false, endpointType: "node", db: 0,
        password: "keepme",
      } }),
    })

    const stored = read()
    expect(stored.bad.connectionDetails.password).toBeUndefined()
    expect(stored.good.connectionDetails.password).toBe("keepme")
  })
})
