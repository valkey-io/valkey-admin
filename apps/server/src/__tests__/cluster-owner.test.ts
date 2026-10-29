import { describe, it } from "node:test"
import assert from "node:assert"
import { findClusterOwner } from "../cluster-owner"
import { createOwnerState } from "../owner"
import type { ClusterNodeMap } from "../metrics-orchestrator"

const CLUSTER = "c1"
const node = (host: string, port: number, replicas: Array<[string, number]> = []) => ({
  host, port, tls: false, verifyTlsCertificate: false,
  replicas: replicas.map(([h, p], i) => ({ id: `r${i}`, host: h, port: p })),
})

// The real cluster: three primaries, one replica each.
const realTopology: ClusterNodeMap = {
  "10-0-0-1-7001": node("10.0.0.1", 7001, [["10.0.0.4", 7004]]),
  "10-0-0-2-7002": node("10.0.0.2", 7002, [["10.0.0.5", 7005]]),
  "10-0-0-3-7003": node("10.0.0.3", 7003, [["10.0.0.6", 7006]]),
}

const owner = (seedHost: string, seedPort: number, registry: ClusterNodeMap | undefined, env = false) => {
  const identity = "password~alice"
  const state = createOwnerState(`${identity}@${seedHost}:${seedPort}`, identity, { host: seedHost, port: seedPort }, env)
  if (registry) state.clusterNodesRegistry.set(CLUSTER, registry)
  return state
}

describe("findClusterOwner", () => {
  it("joins the existing owner when connecting through another primary of the same cluster", () => {
    const victim = owner("10.0.0.1", 7001, realTopology)
    const found = findClusterOwner(CLUSTER, { host: "10.0.0.2", port: 7002 }, realTopology, [victim])
    assert.strictEqual(found, victim)
  })

  it("joins through a replica too", () => {
    const victim = owner("10.0.0.1", 7001, realTopology)
    const found = findClusterOwner(CLUSTER, { host: "10.0.0.5", port: 7005 }, realTopology, [victim])
    assert.strictEqual(found, victim)
  })

  it("victim first, then attacker: the attacker's host is not in the victim's registry", () => {
    const victim = owner("10.0.0.1", 7001, realTopology)
    const fakeTopology: ClusterNodeMap = { ...realTopology, "6-6-6-6-6379": node("6.6.6.6", 6379) }
    const found = findClusterOwner(CLUSTER, { host: "6.6.6.6", port: 6379 }, fakeTopology, [victim])
    assert.strictEqual(found, undefined)
  })

  it("attacker first, then victim: the real topology does not list the attacker's seed", () => {
    const fakeTopology: ClusterNodeMap = { ...realTopology, "6-6-6-6-6379": node("6.6.6.6", 6379) }
    const attacker = owner("6.6.6.6", 6379, fakeTopology)
    const found = findClusterOwner(CLUSTER, { host: "10.0.0.1", port: 7001 }, realTopology, [attacker])
    assert.strictEqual(found, undefined)
  })

  it("does not join when the registry has not caught up with a topology change", () => {
    const stale = owner("10.0.0.1", 7001, { "10-0-0-1-7001": node("10.0.0.1", 7001) })
    const found = findClusterOwner(CLUSTER, { host: "10.0.0.2", port: 7002 }, realTopology, [stale])
    assert.strictEqual(found, undefined)
  })

  it("applies rule 1 only for the env owner", () => {
    // The env owner's seed is a cluster endpoint name that CLUSTER SLOTS never reports.
    const env = owner("clustercfg.example", 6379, realTopology, true)
    const found = findClusterOwner(CLUSTER, { host: "10.0.0.2", port: 7002 }, realTopology, [env])
    assert.strictEqual(found, env)
    const notMember = findClusterOwner(CLUSTER, { host: "6.6.6.6", port: 6379 }, realTopology, [env])
    assert.strictEqual(notMember, undefined)
  })

  it("compares hosts after normalization", () => {
    // Seed and registry use one spelling, the new node's topology another.
    const victim = owner("valkey-7001", 7001, {
      "valkey-7001-7001": node("Valkey-7001", 7001),
      "valkey-7002-7002": node("valkey-7002.", 7002),
    })
    const topology: ClusterNodeMap = { "a": node("VALKEY-7001", 7001), "b": node("valkey-7002", 7002) }
    const found = findClusterOwner(CLUSTER, { host: "valkey-7002", port: 7002 }, topology, [victim])
    assert.strictEqual(found, victim)
  })

  it("joins through the owner's own seed even when the topology does not list it", () => {
    // A seed typed as a name the nodes do not announce, e.g. a K8s service.
    const owner_ = owner("valkey-svc.ns.svc", 6379, realTopology)
    const found = findClusterOwner(CLUSTER, { host: "valkey-svc.ns.svc", port: 6379 }, realTopology, [owner_])
    assert.strictEqual(found, owner_)
  })

  // Pins the known limitation: a non-env owner seeded on a name the nodes do
  // not announce fails rule 2 for every other node, so those nodes get their
  // own owners. Connecting through the cluster endpoint form avoids this.
  it("does not join through another node when the owner's seed is a name the topology does not list", () => {
    const owner_ = owner("valkey-svc.ns.svc", 6379, realTopology)
    const found = findClusterOwner(CLUSTER, { host: "10.0.0.2", port: 7002 }, realTopology, [owner_])
    assert.strictEqual(found, undefined)
  })

  it("ignores owners with no registry for this cluster", () => {
    const other = owner("10.0.0.1", 7001, undefined)
    other.clusterNodesRegistry.set("c2", realTopology)
    assert.strictEqual(findClusterOwner(CLUSTER, { host: "10.0.0.1", port: 7001 }, realTopology, [other]), undefined)
  })
})
