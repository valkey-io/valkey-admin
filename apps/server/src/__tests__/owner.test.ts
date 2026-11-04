import { describe, it } from "node:test"
import assert from "node:assert"
import { allOwnerStates, decodeOwnerDir, encodeOwnerDir, getOwnerState, identityOf, ownerOf } from "../owner"
import type { ConnectionDetails } from "../actions/connection"

const base: ConnectionDetails = {
  host: "127.0.0.1",
  port: "6379",
  tls: false,
  verifyTlsCertificate: false,
  endpointType: "node",
  db: 0,
}

describe("identityOf", () => {
  it("keys password auth by username", () => {
    assert.strictEqual(identityOf({ ...base, username: "alice", password: "pw" }), "password~alice")
  })

  it("uses default when the username is empty or absent", () => {
    assert.strictEqual(identityOf({ ...base, username: "", password: "pw" }), "password~default")
    assert.strictEqual(identityOf({ ...base, password: "pw" }), "password~default")
  })

  // Without a password Glide sends no credentials, so the connection runs as `default`
  // whatever username was typed. Naming a user must not give access to that user's client.
  it("uses default when there is no password, even with a username", () => {
    assert.strictEqual(identityOf({ ...base, username: "admin_user" }), "password~default")
    assert.strictEqual(identityOf({ ...base, username: "admin_user", password: "" }), "password~default")
  })

  it("does not ignore case in the username", () => {
    assert.notStrictEqual(
      identityOf({ ...base, username: "Alice", password: "pw" }),
      identityOf({ ...base, username: "alice", password: "pw" }),
    )
  })

  it("keys ElastiCache IAM by region, replication group and username", () => {
    assert.strictEqual(
      identityOf({ ...base, authType: "iam", username: "iam-user", awsRegion: "us-east-1", awsReplicationGroupId: "my-rg" }),
      "iam~us-east-1~my-rg~iam-user",
    )
  })

  it("keys GCP IAM as default", () => {
    assert.strictEqual(identityOf({ ...base, authType: "gcp-iam", username: "ignored" }), "gcp-iam~default")
  })

  it("does not depend on the password value", () => {
    assert.strictEqual(
      identityOf({ ...base, username: "alice", password: "one" }),
      identityOf({ ...base, username: "alice", password: "two" }),
    )
  })
})

describe("ownerOf", () => {
  const ep = { host: "cache.internal", port: 6379 }

  it("is the identity on one endpoint", () => {
    assert.strictEqual(ownerOf({ ...base, username: "alice", password: "pw" }, ep), "password~alice@cache.internal:6379")
    assert.strictEqual(
      ownerOf({ ...base, authType: "iam", username: "u", awsRegion: "r", awsReplicationGroupId: "g" }, ep),
      "iam~r~g~u@cache.internal:6379",
    )
    assert.strictEqual(ownerOf({ ...base, authType: "gcp-iam" }, ep), "gcp-iam~default@cache.internal:6379")
  })

  // The same username on two servers is two owners.
  it("separates the same identity on different endpoints", () => {
    const details = { ...base, username: "default", password: "pw" }
    assert.notStrictEqual(ownerOf(details, ep), ownerOf(details, { host: "6.6.6.6", port: 6379 }))
    assert.notStrictEqual(ownerOf(details, ep), ownerOf(details, { host: "cache.internal", port: 6380 }))
  })
})

describe("getOwnerState", () => {
  it("records identity and seed", () => {
    const ep = { host: "10.0.0.5", port: 7001 }
    const state = getOwnerState({ ...base, username: "alice", password: "pw" }, ep)
    assert.strictEqual(state.ownerKey, "password~alice@10.0.0.5:7001")
    assert.strictEqual(state.identity, "password~alice")
    assert.deepStrictEqual(state.seed, ep)
    assert.strictEqual(getOwnerState({ ...base, username: "alice", password: "other" }, ep), state)
  })
})

describe("encodeOwnerDir / decodeOwnerDir", () => {
  const keys = [
    "password~alice",
    "password~Alice",
    "password~default",
    "password~a.b/c\\d..e",
    "password~ünïcødé",
    "iam~us-east-1~my-rg~iam-user",
    "gcp-iam~default",
  ]

  it("round-trips", () => {
    for (const key of keys) assert.strictEqual(decodeOwnerDir(encodeOwnerDir(key)), key)
  })

  it("keeps lowercase letters, digits, - _ ~ as they are", () => {
    assert.strictEqual(encodeOwnerDir("password~alice_01-x"), "password~alice_01-x")
  })

  it("keeps names distinct on case-insensitive filesystems", () => {
    const a = encodeOwnerDir("password~Alice").toLowerCase()
    const b = encodeOwnerDir("password~alice").toLowerCase()
    assert.notStrictEqual(a, b)
  })

  it("produces a single safe path segment", () => {
    for (const key of keys) {
      const dir = encodeOwnerDir(key)
      assert.match(dir, /^[a-z0-9_~%A-F-]+$/)
      assert.ok(!dir.includes("/") && !dir.includes("\\") && !dir.includes("."), dir)
    }
  })

  it("caps long names with a hash suffix", () => {
    const long = `password~${"U".repeat(300)}`
    const dir = encodeOwnerDir(long)
    assert.ok(Buffer.byteLength(dir) <= 200, `length ${Buffer.byteLength(dir)}`)
    assert.match(dir, /~h[0-9a-f]{16}$/)
    assert.notStrictEqual(encodeOwnerDir(`password~${"U".repeat(301)}`), dir)
  })
})

describe("owner state registry", () => {
  it("gives each owner its own maps and reuses them", () => {
    const a = getOwnerState("password~a-test")
    const b = getOwnerState("password~b-test")
    assert.notStrictEqual(a.clients, b.clients)
    assert.notStrictEqual(a.metricsServerMap, b.metricsServerMap)
    assert.strictEqual(getOwnerState("password~a-test"), a)
    assert.ok(allOwnerStates().includes(a) && allOwnerStates().includes(b))
  })
})
