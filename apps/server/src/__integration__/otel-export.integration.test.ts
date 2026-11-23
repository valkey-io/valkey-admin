import { randomUUID } from "node:crypto"
import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { GlideClient, TimeUnit } from "@valkey/valkey-glide"
import { VALKEY, buildConnectionId, toNodeId } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, defaultStandaloneConnectionDetails, WS_URL } from "./harness/fixture"

/**
 * The test stack runs an OpenTelemetry Collector (`examples/otel/otel-collector-config.yaml`)
 * and starts the server with `METRICS_OTEL_ENABLED=true`, so every collector the server
 * spawns pushes OTLP to it. This suite reads the Collector's Prometheus endpoint.
 *
 * Other suites can run at the same time and spawn their own collectors (the standalone
 * node, the fake cluster node). The checks below only look at the instances this suite
 * expects.
 */
const PROMETHEUS_URL = "http://localhost:8889/metrics"
const NAMESPACE = "integration"

// Every metric family a Linux Valkey 9.x node exports when maxmemory is 0.
// `valkey_memory_max_bytes` is left out because the test stack runs with maxmemory 0.
const EXPECTED_FAMILIES: Record<string, "gauge" | "counter"> = {
  valkey_memory_used_bytes: "gauge",
  valkey_memory_used_overhead_bytes: "gauge",
  valkey_memory_used_dataset_bytes: "gauge",
  valkey_memory_used_peak_bytes: "gauge",
  valkey_memory_used_rss_bytes: "gauge",
  valkey_memory_used_startup_bytes: "gauge",
  valkey_memory_fragmentation_ratio: "gauge",
  valkey_memory_fragmentation_bytes: "gauge",
  valkey_memory_allocator_allocated_bytes: "gauge",
  valkey_memory_allocator_active_bytes: "gauge",
  valkey_memory_allocator_resident_bytes: "gauge",
  valkey_memory_allocator_frag_bytes: "gauge",
  valkey_memory_not_counted_for_evict_bytes: "gauge",
  valkey_memory_clients_normal_bytes: "gauge",
  valkey_memory_replication_backlog_bytes: "gauge",
  valkey_memory_total_replication_buffers_bytes: "gauge",
  valkey_memory_used_vm_eval_bytes: "gauge",
  valkey_memory_used_vm_functions_bytes: "gauge",
  valkey_memory_lazyfree_pending_objects: "gauge",
  valkey_db_keys: "gauge",
  valkey_db_expires: "gauge",
  valkey_cpu_time_seconds_total: "counter",
  valkey_cpu_main_thread_time_seconds_total: "counter",
  valkey_cpu_children_time_seconds_total: "counter",
}

// Labels the Collector's prometheus exporter may put on a sample, plus the two data point attributes.
const ALLOWED_LABELS = new Set([
  "instance", "job", "otel_scope_name", "otel_scope_version", "otel_scope_schema_url", "cpu_mode", "valkey_db_index",
])

type Sample = { name: string; labels: Record<string, string>; value: number }
type Scrape = { body: string; samples: Sample[]; types: Record<string, string> }

const parseLabels = (raw: string): Record<string, string> => {
  const labels: Record<string, string> = {}
  for (const match of raw.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) labels[match[1]] = match[2]
  return labels
}

const scrape = async (): Promise<Scrape> => {
  const body = await (await fetch(PROMETHEUS_URL)).text()
  const samples: Sample[] = []
  const types: Record<string, string> = {}
  for (const line of body.split("\n")) {
    const type = line.match(/^# TYPE (\S+) (\S+)/)
    if (type) {
      types[type[1]] = type[2]
      continue
    }
    const sample = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})? (\S+)/)
    if (sample) samples.push({ name: sample[1], labels: parseLabels(sample[2] ?? ""), value: Number(sample[3]) })
  }
  return { body, samples, types }
}

const pollUntil = async (check: (s: Scrape) => boolean, timeoutMs: number): Promise<Scrape> => {
  const until = Date.now() + timeoutMs
  let last: Scrape = { body: "", samples: [], types: {} }
  while (Date.now() < until) {
    try {
      last = await scrape()
      if (check(last)) return last
    } catch {
      // the Collector may not be ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return last
}

// The collector's node id, which is its service.instance.id.
const nodeIdOf = (host: string, port: number | string) => toNodeId(buildConnectionId(host, port, 0))

const instancesWith = (s: Scrape, metric: string) =>
  new Set(s.samples.filter((x) => x.name === metric).map((x) => x.labels.instance))

describe("integration / otel export", async () => {
  const ws = await WsClient.connect(WS_URL)
  const keyName = `otel-it-${randomUUID()}`
  let glide: GlideClient | undefined

  after(async () => {
    try {
      await glide?.del([keyName])
    } catch {
      // best effort
    }
    glide?.close()
    await ws.close()
  })

  let primaries: string[] = []
  let replicas: string[] = []

  it("exports each primary of the preconfigured cluster, and no replica", async () => {
    const connectionDetails = defaultConnectionDetails()
    const discoveryId = `discovery-otel-${buildConnectionId(connectionDetails.host, connectionDetails.port, 0)}`
    ws.send({ type: VALKEY.TOPOLOGY.discoveryEndpointPending, payload: { discoveryId, connectionDetails } })
    const msg = await ws.waitFor(VALKEY.TOPOLOGY.discoveryEndpointFulfilled, 30000)
    const nodes = Object.values(msg.payload?.clusterNodes ?? {}) as Array<{
      host: string; port: number; replicas: Array<{ host: string; port: number }>
    }>
    primaries = nodes.map((n) => nodeIdOf(n.host, n.port)).sort()
    replicas = nodes.flatMap((n) => n.replicas.map((r) => nodeIdOf(r.host, r.port))).sort()
    assert.equal(primaries.length, 3, "the test cluster has 3 primaries")

    const clusterIds = new Set([...primaries, ...replicas])
    const result = await pollUntil((s) => primaries.every((id) => instancesWith(s, "valkey_memory_used_bytes").has(id)), 90_000)
    const exported = [...instancesWith(result, "valkey_memory_used_bytes")].filter((id) => clusterIds.has(id)).sort()

    assert.deepEqual(exported, primaries, "the exported cluster instances must be exactly the primaries")
    replicas.forEach((id) => assert.ok(!exported.includes(id), `replica ${id} must not export`))
  })

  it("sets the node identity and passes OTEL_RESOURCE_ATTRIBUTES through", async () => {
    const id = nodeIdOf("valkey-7001", 7001)
    const result = await pollUntil((s) => s.samples.some((x) => x.name === "target_info" && x.labels.instance === id), 60_000)
    const info = result.samples.find((x) => x.name === "target_info" && x.labels.instance === id)
    assert.ok(info, `target_info for ${id}`)
    assert.equal(info.labels.job, `${NAMESPACE}/valkey`, "job is service.namespace/service.name")
    assert.equal(info.labels.db_system_name, "valkey")
    assert.equal(info.labels.server_address, "valkey-7001")
    assert.equal(info.labels.server_port, "7001")
  })

  it("exports the design metric families with the expected types", async () => {
    const id = nodeIdOf("valkey-7001", 7001)
    const has = (s: Scrape, name: string) => s.samples.some((x) => x.name === name && x.labels.instance === id)
    const result = await pollUntil((s) => Object.keys(EXPECTED_FAMILIES).every((name) => has(s, name)), 60_000)

    for (const [name, type] of Object.entries(EXPECTED_FAMILIES)) {
      assert.ok(has(result, name), `${name} for ${id}`)
      const family = name.endsWith("_total") ? name.slice(0, -"_total".length) : name
      assert.equal(result.types[name] ?? result.types[family], type, `# TYPE of ${name}`)
    }
    assert.ok(!has(result, "valkey_memory_max_bytes"), "maxmemory is 0, so valkey_memory_max_bytes is left out")

    const cpuModes = new Set(result.samples
      .filter((x) => x.name === "valkey_cpu_time_seconds_total" && x.labels.instance === id)
      .map((x) => x.labels.cpu_mode))
    assert.deepEqual([...cpuModes].sort(), ["system", "user"])
  })

  it("exports keys and expires per database, and never a key name", async () => {
    const details = defaultStandaloneConnectionDetails(0)
    const connectionId = buildConnectionId(details.host, details.port, 0)
    ws.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId, connectionDetails: details } })
    await ws.waitFor(VALKEY.CONNECTION.standaloneConnectFulfilled, 30000)

    glide = await GlideClient.createClient({ addresses: [{ host: "localhost", port: 6379 }], databaseId: 1, requestTimeout: 5000 })
    await glide.set(keyName, "v", { expiry: { type: TimeUnit.Seconds, count: 600 } })

    const id = nodeIdOf(details.host, details.port)
    const atLeastOne = (s: Scrape, metric: string) => s.samples.some((x) =>
      x.name === metric && x.labels.instance === id && x.labels.valkey_db_index === "1" && x.value >= 1)
    const result = await pollUntil((s) => atLeastOne(s, "valkey_db_keys") && atLeastOne(s, "valkey_db_expires"), 90_000)
    assert.ok(atLeastOne(result, "valkey_db_keys"), `valkey_db_keys{valkey_db_index="1"} >= 1 for ${id}`)
    assert.ok(atLeastOne(result, "valkey_db_expires"), `valkey_db_expires{valkey_db_index="1"} >= 1 for ${id}`)

    // Two more export intervals (poll_ms 5000), then the whole body must not contain the key name.
    await new Promise((resolve) => setTimeout(resolve, 11_000))
    const later = await scrape()
    assert.ok(!later.body.includes(keyName), "the key name must not reach the exported data")
    for (const sample of later.samples.filter((x) => x.name.startsWith("valkey_"))) {
      for (const label of Object.keys(sample.labels)) {
        assert.ok(ALLOWED_LABELS.has(label), `${sample.name} has the unexpected label ${label}`)
      }
    }
  })
})
