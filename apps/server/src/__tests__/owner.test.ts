import { describe, it } from "node:test"
import assert from "node:assert"
import { ownerOf } from "../owner"
import type { ConnectionDetails } from "../actions/connection"

const base: ConnectionDetails = {
  host: "127.0.0.1",
  port: "6379",
  tls: false,
  verifyTlsCertificate: false,
  endpointType: "node",
  db: 0,
}

describe("ownerOf", () => {
  it("keys password auth by username", () => {
    assert.strictEqual(ownerOf({ ...base, username: "alice", password: "pw" }), "password~alice")
  })

  it("uses default when the username is empty or absent", () => {
    assert.strictEqual(ownerOf({ ...base, username: "", password: "pw" }), "password~default")
    assert.strictEqual(ownerOf({ ...base, password: "pw" }), "password~default")
  })

  // Without a password Glide sends no credentials, so the connection runs as `default`
  // whatever username was typed. Naming a user must not give access to that user's client.
  it("uses default when there is no password, even with a username", () => {
    assert.strictEqual(ownerOf({ ...base, username: "admin_user" }), "password~default")
    assert.strictEqual(ownerOf({ ...base, username: "admin_user", password: "" }), "password~default")
  })

  it("does not ignore case in the username", () => {
    assert.notStrictEqual(
      ownerOf({ ...base, username: "Alice", password: "pw" }),
      ownerOf({ ...base, username: "alice", password: "pw" }),
    )
  })

  it("keys ElastiCache IAM by region, replication group and username", () => {
    assert.strictEqual(
      ownerOf({ ...base, authType: "iam", username: "iam-user", awsRegion: "us-east-1", awsReplicationGroupId: "my-rg" }),
      "iam~us-east-1~my-rg~iam-user",
    )
  })

  it("keys GCP IAM as default", () => {
    assert.strictEqual(ownerOf({ ...base, authType: "gcp-iam", username: "ignored" }), "gcp-iam~default")
  })

  it("does not depend on the password value", () => {
    assert.strictEqual(
      ownerOf({ ...base, username: "alice", password: "one" }),
      ownerOf({ ...base, username: "alice", password: "two" }),
    )
  })
})
