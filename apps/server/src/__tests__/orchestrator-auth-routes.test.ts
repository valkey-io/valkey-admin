import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import {
  ORCHESTRATOR_AUTH_DOMAIN,
  ORCHESTRATOR_AUTH_HEADER,
  ORCHESTRATOR_AUTH_WINDOW_ENV,
  createOrchestratorAuthCredential
} from "valkey-common"
import { metricsServerMap, __test__ } from "../metrics-orchestrator"
import type { Request, Response } from "express"

const NODE_ID = "127-0-0-1-6379"
const KEY = "a".repeat(64)
const URI = "http://127.0.0.1:54321"
const SEEDED_URI = "http://127.0.0.1:11111"
const SEEDED_LAST_SEEN = 1_000

const makeRes = () => {
  const captured: { statusCode: number; body?: unknown } = { statusCode: 200 }
  const res = {
    status(code: number) {
      captured.statusCode = code
      return res
    },
    send(body?: unknown) {
      captured.body = body
      return res
    },
    sendStatus(code: number) {
      captured.statusCode = code
      return res
    },
  }
  return { res: res as unknown as Response, captured }
}

const makeReq = (body: unknown, credential?: string | string[]) => ({
  body,
  headers: credential === undefined ? {} : { [ORCHESTRATOR_AUTH_HEADER]: credential },
}) as unknown as Request

const seedCollector = () => {
  __test__.collectorKeys.set(NODE_ID, KEY)
  metricsServerMap.set(NODE_ID, {
    metricsURI: SEEDED_URI,
    pid: 4242,
    lastSeen: SEEDED_LAST_SEEN,
  })
}

const signRegister = (
  fields: { nodeId?: string; metricsServerUri?: string; timestamp?: number } = {},
  key = KEY,
) => createOrchestratorAuthCredential(key, ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
  nodeId: NODE_ID,
  metricsServerUri: URI,
  timestamp: Date.now(),
  ...fields,
}) as string

const signPing = (
  fields: { nodeId?: string; timestamp?: number } = {},
  key = KEY,
) => createOrchestratorAuthCredential(key, ORCHESTRATOR_AUTH_DOMAIN.PING, {
  nodeId: NODE_ID,
  timestamp: Date.now(),
  ...fields,
}) as string

const assertEntryUntouched = () => {
  const entry = metricsServerMap.get(NODE_ID)
  assert.strictEqual(entry?.metricsURI, SEEDED_URI, "metricsURI must not change on a rejected request")
  assert.strictEqual(entry?.lastSeen, SEEDED_LAST_SEEN, "lastSeen must not change on a rejected request")
}

describe("POST /orchestrator/register", () => {
  beforeEach(seedCollector)

  afterEach(() => {
    mock.restoreAll()
    metricsServerMap.clear()
    __test__.collectorKeys.clear()
    delete process.env[ORCHESTRATOR_AUTH_WINDOW_ENV]
  })

  it("accepts a correctly signed registration and records the advertised URI", () => {
    const timestamp = Date.now()
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: URI, pid: 99, timestamp }, signRegister({ timestamp })),
      res,
    )

    assert.strictEqual(captured.statusCode, 200)
    assert.strictEqual(captured.body, "Registered node")
    assert.strictEqual(metricsServerMap.get(NODE_ID)?.metricsURI, URI)
    assert.ok((metricsServerMap.get(NODE_ID)?.lastSeen ?? 0) > SEEDED_LAST_SEEN)
  })

  // `entry.pid` is a `process.kill` target, written once from the spawned
  // child's own `proc.pid`. A self-reported pid must not be able to retarget
  // it: a negative value would signal a whole process group, and a NaN would
  // suppress collector cleanup entirely (the delete sits inside the pid guard
  // in `stopMetricsServer`).
  it("ignores a reported pid even on an otherwise valid registration", () => {
    const timestamp = Date.now()

    for (const pid of [99, -1, "abc", 0, null]) {
      __test__.handleRegister(
        makeReq(
          { nodeId: NODE_ID, metricsServerUri: URI, pid, timestamp },
          signRegister({ timestamp }),
        ),
        makeRes().res,
      )
      assert.strictEqual(
        metricsServerMap.get(NODE_ID)?.pid,
        4242,
        `reported pid ${JSON.stringify(pid)} must not overwrite the spawned pid`,
      )
    }
  })

  // The exploit as filed: an unauthenticated peer pointing a known node at a
  // host it controls.
  it("rejects the unauthenticated hijack of a known nodeId", () => {
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: "http://attacker.example/" }),
      res,
    )

    assert.strictEqual(captured.statusCode, 401)
    assert.strictEqual(captured.body, "Unauthorized")
    assertEntryUntouched()
  })

  // Claim binding: a captured credential cannot be retargeted, because the
  // URI it was issued for is covered by the tag.
  it("rejects a captured credential replayed with a substituted URI", () => {
    const timestamp = Date.now()
    const credential = signRegister({ timestamp })
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: "http://attacker.example/", timestamp }, credential),
      res,
    )

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("rejects a credential signed with the wrong key", () => {
    const timestamp = Date.now()
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq(
        { nodeId: NODE_ID, metricsServerUri: URI, timestamp },
        signRegister({ timestamp }, "b".repeat(64)),
      ),
      res,
    )

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("rejects a ping credential presented as a registration", () => {
    const timestamp = Date.now()
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: URI, timestamp }, signPing({ timestamp })),
      res,
    )

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("rejects a credential outside the freshness window", () => {
    const timestamp = Date.now() - 120_000
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: URI, timestamp }, signRegister({ timestamp })),
      res,
    )

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("honours ORCHESTRATOR_AUTH_WINDOW_MS when widening the window", () => {
    process.env[ORCHESTRATOR_AUTH_WINDOW_ENV] = "300000"
    const timestamp = Date.now() - 120_000
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: URI, timestamp }, signRegister({ timestamp })),
      res,
    )

    assert.strictEqual(captured.statusCode, 200)
  })

  // Closing the 404-vs-200 oracle: an unknown node is indistinguishable from
  // a bad credential, so nodeIds cannot be enumerated through this route.
  it("answers 401, not 404, for an unknown nodeId", () => {
    const timestamp = Date.now()
    const credential = createOrchestratorAuthCredential(KEY, ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
      nodeId: "10-0-0-9-6379",
      metricsServerUri: URI,
      timestamp,
    }) as string
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq({ nodeId: "10-0-0-9-6379", metricsServerUri: URI, timestamp }, credential),
      res,
    )

    assert.strictEqual(captured.statusCode, 401)
    assert.strictEqual(captured.body, "Unauthorized")
  })

  it("rejects a duplicated credential header", () => {
    const timestamp = Date.now()
    const credential = signRegister({ timestamp })
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: URI, timestamp }, [credential, credential]),
      res,
    )

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("rejects a missing request body without throwing", () => {
    const { res, captured } = makeRes()

    __test__.handleRegister(makeReq(undefined), res)

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("rejects a signed but non-http(s) URI with 400", () => {
    const timestamp = Date.now()
    const metricsServerUri = "file:///etc/passwd"
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq(
        { nodeId: NODE_ID, metricsServerUri, timestamp },
        signRegister({ metricsServerUri, timestamp }),
      ),
      res,
    )

    assert.strictEqual(captured.statusCode, 400)
    assertEntryUntouched()
  })

  it("rejects a signed but unparseable URI with 400", () => {
    const timestamp = Date.now()
    const metricsServerUri = "not a url"
    const { res, captured } = makeRes()

    __test__.handleRegister(
      makeReq(
        { nodeId: NODE_ID, metricsServerUri, timestamp },
        signRegister({ metricsServerUri, timestamp }),
      ),
      res,
    )

    assert.strictEqual(captured.statusCode, 400)
    assertEntryUntouched()
  })

  it("never writes credential material to the log", () => {
    const logged: string[] = []
    const capture = (...args: unknown[]) => { logged.push(args.map(String).join(" ")) }
    mock.method(console, "log", capture)
    mock.method(console, "warn", capture)

    const timestamp = Date.now()
    const credential = signRegister({ timestamp })

    // One accepted and one rejected request, so both log paths are covered.
    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: URI, timestamp }, credential),
      makeRes().res,
    )
    __test__.handleRegister(
      makeReq({ nodeId: NODE_ID, metricsServerUri: "http://attacker.example/", timestamp }, credential),
      makeRes().res,
    )

    assert.ok(logged.length > 0, "expected log output to assert against")
    for (const line of logged) {
      assert.ok(!line.includes(credential), `credential leaked into log: ${line}`)
      assert.ok(!line.includes(KEY), `key leaked into log: ${line}`)
    }
  })

  it("rejects a malformed nodeId at the boundary, without logging the value", () => {
    const logged: string[] = []
    const capture = (...args: unknown[]) => { logged.push(args.map(String).join(" ")) }
    mock.method(console, "warn", capture)
    mock.method(console, "log", capture)

    const forged = "evil\nMetrics server registered for 127-0-0-1-6379 at http://attacker.example/"
    const { res, captured } = makeRes()

    __test__.handleRegister(makeReq({ nodeId: forged, metricsServerUri: URI }), res)

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
    // The untrusted value never reaches a log record, so there is nothing to
    // sanitise and no way to forge a second line.
    for (const line of logged) {
      assert.ok(!line.includes("\n"), `log record must not be forgeable: ${JSON.stringify(line)}`)
      assert.ok(!line.includes("attacker.example"), `untrusted value must not be logged: ${line}`)
    }
  })

  it("rejects nodeIds outside the permitted character set", () => {
    for (const nodeId of [
      "evil\nsecond-line",
      "has space",
      "has/slash",
      "has:colon",
      "has.dot",
      "trailing\r",
      "\u001b[31mred",
      "",
    ]) {
      const { res, captured } = makeRes()
      __test__.handleRegister(makeReq({ nodeId, metricsServerUri: URI }), res)
      assert.strictEqual(captured.statusCode, 401, `expected ${JSON.stringify(nodeId)} to be rejected`)
    }
    assertEntryUntouched()
  })

  it("rejects a non-string nodeId without throwing", () => {
    for (const nodeId of [undefined, null, 42, {}, [], true]) {
      const { res, captured } = makeRes()
      __test__.handleRegister(makeReq({ nodeId, metricsServerUri: URI }), res)
      assert.strictEqual(captured.statusCode, 401, `expected ${JSON.stringify(nodeId)} to be rejected`)
    }
    assertEntryUntouched()
  })

  it("rejects an unbounded nodeId so it cannot flood the log", () => {
    const { res, captured } = makeRes()

    __test__.handleRegister(makeReq({ nodeId: "a".repeat(100_000), metricsServerUri: URI }), res)

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  // Real collector ids are always `<host>-<port>` via `sanitizeUrl`, including
  // long Kubernetes pod DNS names, so the gate must not reject those.
  it("accepts a full-length Kubernetes pod DNS node id", () => {
    const nodeId = "valkey-0-valkey-headless-valkey-svc-cluster-local-6379"
    const timestamp = Date.now()
    __test__.collectorKeys.set(nodeId, KEY)
    metricsServerMap.set(nodeId, { metricsURI: "", pid: 1, lastSeen: 0 })

    const credential = createOrchestratorAuthCredential(KEY, ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
      nodeId, metricsServerUri: URI, timestamp,
    }) as string
    const { res, captured } = makeRes()

    __test__.handleRegister(makeReq({ nodeId, metricsServerUri: URI, timestamp }, credential), res)

    assert.strictEqual(captured.statusCode, 200)
    assert.strictEqual(metricsServerMap.get(nodeId)?.metricsURI, URI)
  })
})

describe("POST /orchestrator/ping", () => {
  beforeEach(seedCollector)

  afterEach(() => {
    mock.restoreAll()
    metricsServerMap.clear()
    __test__.collectorKeys.clear()
  })

  it("accepts a correctly signed ping and refreshes lastSeen", () => {
    const timestamp = Date.now()
    const { res, captured } = makeRes()

    __test__.handlePing(makeReq({ nodeId: NODE_ID, timestamp }, signPing({ timestamp })), res)

    assert.strictEqual(captured.statusCode, 200)
    assert.ok((metricsServerMap.get(NODE_ID)?.lastSeen ?? 0) > SEEDED_LAST_SEEN)
  })

  it("rejects an unsigned ping", () => {
    const { res, captured } = makeRes()

    __test__.handlePing(makeReq({ nodeId: NODE_ID }), res)

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("rejects a malformed nodeId at the boundary", () => {
    const logged: string[] = []
    mock.method(console, "warn", (...args: unknown[]) => { logged.push(args.map(String).join(" ")) })

    const { res, captured } = makeRes()
    __test__.handlePing(makeReq({ nodeId: "evil\nforged line" }), res)

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
    for (const line of logged) {
      assert.ok(!line.includes("\n"), `log record must not be forgeable: ${JSON.stringify(line)}`)
    }
  })

  it("rejects a registration credential presented as a ping", () => {
    const timestamp = Date.now()
    const { res, captured } = makeRes()

    __test__.handlePing(makeReq({ nodeId: NODE_ID, timestamp }, signRegister({ timestamp })), res)

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("rejects a ping outside the freshness window", () => {
    const timestamp = Date.now() - 120_000
    const { res, captured } = makeRes()

    __test__.handlePing(makeReq({ nodeId: NODE_ID, timestamp }, signPing({ timestamp })), res)

    assert.strictEqual(captured.statusCode, 401)
    assertEntryUntouched()
  })

  it("answers 401, not 404, for an unknown nodeId", () => {
    const timestamp = Date.now()
    const credential = createOrchestratorAuthCredential(KEY, ORCHESTRATOR_AUTH_DOMAIN.PING, {
      nodeId: "10-0-0-9-6379",
      timestamp,
    }) as string
    const { res, captured } = makeRes()

    __test__.handlePing(makeReq({ nodeId: "10-0-0-9-6379", timestamp }, credential), res)

    assert.strictEqual(captured.statusCode, 401)
    assert.strictEqual(captured.body, "Unauthorized")
  })
})
