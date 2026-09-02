import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import { ORCHESTRATOR_AUTH_KEY_ENV } from "valkey-common"
import {
  metricsServerMap,
  resolveCollectorKey,
  startMetricsServer,
  stopAllMetricsServers,
  __test__
} from "../metrics-orchestrator"
import type { ChildProcess, SpawnOptions } from "child_process"

const NODE = {
  host: "127.0.0.1",
  port: "6379",
  tls: false,
  verifyTlsCertificate: false,
}

const fakeChild = (pid: number) => ({
  pid,
  stderr: null,
  on: () => undefined,
}) as unknown as ChildProcess

describe("collector key material", () => {
  let spawnedEnvs: SpawnOptions["env"][]

  beforeEach(() => {
    spawnedEnvs = []
    let nextPid = 1000
    mock.method(
      __test__,
      "spawnProcess",
      (_command: string, _args: string[], options: SpawnOptions) => {
        spawnedEnvs.push(options.env)
        nextPid += 1
        return fakeChild(nextPid)
      },
    )
  })

  afterEach(() => {
    mock.restoreAll()
    metricsServerMap.clear()
    __test__.collectorKeys.clear()
    delete process.env[ORCHESTRATOR_AUTH_KEY_ENV]
  })

  it("mints a key for a spawned collector and hands the same key to the child", async () => {
    await startMetricsServer(NODE, "node-a")

    const key = resolveCollectorKey("node-a")
    assert.match(key ?? "", /^[0-9a-f]{64}$/)
    assert.strictEqual(spawnedEnvs.length, 1)
    assert.strictEqual(spawnedEnvs[0]?.[ORCHESTRATOR_AUTH_KEY_ENV], key)
  })

  it("gives each collector a distinct key", async () => {
    await startMetricsServer(NODE, "node-a")
    await startMetricsServer({ ...NODE, port: "6380" }, "node-b")

    const keyA = resolveCollectorKey("node-a")
    const keyB = resolveCollectorKey("node-b")
    assert.ok(keyA && keyB)
    assert.notStrictEqual(keyA, keyB)
  })

  // Regression guard for the env-ordering trap: the spawn options spread
  // `...process.env` first, so a shared ORCHESTRATOR_KEY on the orchestrator
  // would otherwise reach every child. A child signing with a key the
  // orchestrator does not verify it against fails every registration.
  it("shadows an ORCHESTRATOR_KEY inherited from the orchestrator environment", async () => {
    process.env[ORCHESTRATOR_AUTH_KEY_ENV] = "shared-key-provisioned-by-operator"

    await startMetricsServer(NODE, "node-a")

    const key = resolveCollectorKey("node-a")
    assert.strictEqual(spawnedEnvs[0]?.[ORCHESTRATOR_AUTH_KEY_ENV], key)
    assert.notStrictEqual(
      spawnedEnvs[0]?.[ORCHESTRATOR_AUTH_KEY_ENV],
      "shared-key-provisioned-by-operator",
    )
  })

  it("returns undefined for a node with no spawned collector", () => {
    assert.strictEqual(resolveCollectorKey("never-spawned"), undefined)
  })

  it("keeps key material out of metricsServerMap", async () => {
    await startMetricsServer(NODE, "node-a")

    const key = resolveCollectorKey("node-a")
    assert.ok(key)
    const serialised = JSON.stringify([...metricsServerMap.entries()])
    assert.ok(
      !serialised.includes(key),
      "key material must not be reachable by serialising metricsServerMap",
    )
  })

  it("keeps key material out of log output", async () => {
    const logged: string[] = []
    const capture = (...args: unknown[]) => { logged.push(args.map(String).join(" ")) }
    mock.method(console, "log", capture)
    mock.method(console, "debug", capture)
    mock.method(console, "warn", capture)
    mock.method(console, "error", capture)

    await startMetricsServer(NODE, "node-a")

    const key = resolveCollectorKey("node-a")
    assert.ok(key)
    assert.ok(
      !logged.some((line) => line.includes(key)),
      `key material leaked into logs: ${logged.join(" | ")}`,
    )
  })

  it("forgets the key when a collector is stopped", async () => {
    mock.method(process, "kill", () => true)
    await startMetricsServer(NODE, "node-a")
    assert.ok(resolveCollectorKey("node-a"))

    await __test__.stopMetricsServer("node-a")

    assert.strictEqual(resolveCollectorKey("node-a"), undefined)
    assert.strictEqual(metricsServerMap.has("node-a"), false)
  })

  it("forgets every key when all collectors are stopped", async () => {
    mock.method(process, "kill", () => true)
    await startMetricsServer(NODE, "node-a")
    await startMetricsServer({ ...NODE, port: "6380" }, "node-b")

    await stopAllMetricsServers(metricsServerMap)

    assert.strictEqual(resolveCollectorKey("node-a"), undefined)
    assert.strictEqual(resolveCollectorKey("node-b"), undefined)
    assert.strictEqual(__test__.collectorKeys.size, 0)
  })
})
