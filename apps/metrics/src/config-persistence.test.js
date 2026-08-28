import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"

/**
 * Persistence of `POST /update-config`, exercised against a real filesystem
 * and a real YAML parser.
 *
 * `config.test.js` mocks both to assert call shapes; these tests instead prove
 * what an operator gets: which bytes of their file change, which do not, and
 * that an unwritable file costs durability rather than the update.
 */
describe("config persistence", () => {
  let tmpDir
  let cfgPath
  let cleanup

  const CONFIG_YML = `# Collection streams. Comments here are the operator's.
server:
  port: 0
  data_dir: "/app/data"

epics:
  # sampling settings for the MONITOR-based hot keys path
  - name: "monitor"
    monitoringDuration: 10000
    monitoringInterval: 10000
    cutoffFrequency: 100
    data_retention_mb: 12

  - name: "cpu"
    poll_ms: 5000
    data_retention_mb: 5
`

  const loadFreshConfig = async () => {
    vi.resetModules()
    return import("./config.js")
  }

  const readCfg = () => fs.readFileSync(cfgPath, "utf8")
  const epicFromFile = (name) => YAML.parse(readCfg()).epics.find((e) => e.name === name)

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-persist-test-"))
    cfgPath = path.join(tmpDir, "config.yml")
    fs.writeFileSync(cfgPath, CONFIG_YML, "utf8")

    const previous = { CONFIG_PATH: process.env.CONFIG_PATH, DATA_DIR: process.env.DATA_DIR, PORT: process.env.PORT }
    process.env.CONFIG_PATH = cfgPath
    // Per-node values the process resolves for itself; these must never be
    // written back into the operator's file.
    process.env.DATA_DIR = path.join(tmpDir, "data", "node-7002")
    process.env.PORT = "34567"
    cleanup = () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  afterEach(() => {
    cleanup()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it("changes only the patched field and keeps the rest of the file intact", async () => {
    const { updateConfig } = await loadFreshConfig()

    const result = updateConfig({ epics: { monitor: { monitoringDuration: 15000 } } })

    expect(result.success).toBe(true)
    expect(result.persisted).toBe(true)

    const after = readCfg()
    expect(epicFromFile("monitor").monitoringDuration).toBe(15000)
    // Comments, untouched fields and the other epic all survive.
    expect(after).toContain("# Collection streams. Comments here are the operator's.")
    expect(after).toContain("# sampling settings for the MONITOR-based hot keys path")
    expect(epicFromFile("monitor").cutoffFrequency).toBe(100)
    expect(epicFromFile("cpu")).toEqual({ name: "cpu", poll_ms: 5000, data_retention_mb: 5 })

    // A single field changed; nothing else in the file moved.
    const changedLines = after.split("\n").filter((line, i) => line !== CONFIG_YML.split("\n")[i])
    expect(changedLines).toEqual(["    monitoringDuration: 15000"])
  })

  it("never writes environment-resolved values into the file", async () => {
    const { updateConfig } = await loadFreshConfig()

    updateConfig({ epics: { monitor: { monitoringDuration: 15000 } } })

    const after = readCfg()
    // These are this process's own env values, not the operator's config.
    expect(after).not.toContain("node-7002")
    expect(after).not.toContain("34567")
    expect(YAML.parse(after).server).toEqual({ port: 0, data_dir: "/app/data" })
    // Per-epic defaults are not stamped in either.
    expect(epicFromFile("monitor").data_retention_days).toBeUndefined()
  })

  it("applies multiple epics in one write", async () => {
    const { updateConfig } = await loadFreshConfig()

    const result = updateConfig({
      epics: { monitor: { cutoffFrequency: 5 }, cpu: { poll_ms: 20000, data_retention_days: 7 } },
    })

    expect(result.persisted).toBe(true)
    expect(epicFromFile("monitor").cutoffFrequency).toBe(5)
    expect(epicFromFile("cpu").poll_ms).toBe(20000)
    expect(epicFromFile("cpu").data_retention_days).toBe(7)
  })

  it("survives a restart: a new process reads back what the previous one wrote", async () => {
    const first = await loadFreshConfig()
    first.updateConfig({ epics: { monitor: { monitoringDuration: 45000 } } })

    const second = await loadFreshConfig()
    const monitor = second.getConfig().epics.find((e) => e.name === "monitor")

    expect(monitor.monitoringDuration).toBe(45000)
  })

  it("patches by name, not by position, when the file holds an unknown epic", async () => {
    // validEpics drops "legacy_epic", so the runtime index and the document
    // index diverge; a positional patch would land on the wrong entry.
    fs.writeFileSync(
      cfgPath,
      `epics:
  - name: "legacy_epic"
    poll_ms: 1000
  - name: "monitor"
    monitoringDuration: 10000
`,
      "utf8",
    )
    vi.spyOn(console, "error").mockImplementation(() => {})

    const { updateConfig } = await loadFreshConfig()
    updateConfig({ epics: { monitor: { monitoringDuration: 15000 } } })

    const parsed = YAML.parse(readCfg())
    expect(parsed.epics[0]).toEqual({ name: "legacy_epic", poll_ms: 1000 })
    expect(parsed.epics[1]).toEqual({ name: "monitor", monitoringDuration: 15000 })
  })

  it("stages through a process-unique temporary file", async () => {
    const { updateConfig } = await loadFreshConfig()
    const writeSpy = vi.spyOn(fs, "writeFileSync")

    updateConfig({ epics: { monitor: { monitoringDuration: 15000 } } })

    const staged = writeSpy.mock.calls.map(([target]) => String(target)).find((t) => t.endsWith(".tmp"))
    // Sibling metrics processes share one CONFIG_PATH; a shared staging path
    // lets one rename another's half-written file into place.
    expect(staged).toBe(`${cfgPath}.${process.pid}.tmp`)
    expect(fs.readdirSync(tmpDir).filter((f) => f.includes(".tmp"))).toEqual([])
  })

  it("still applies the update when the config file cannot be written", async () => {
    fs.chmodSync(tmpDir, 0o500) // no write permission on the directory
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const { getConfig, updateConfig } = await loadFreshConfig()
      const result = updateConfig({ epics: { monitor: { monitoringDuration: 15000 } } })

      // Durability is best effort; the request is not.
      expect(result.success).toBe(true)
      expect(result.statusCode).toBe(200)
      expect(result.persisted).toBe(false)
      expect(getConfig().epics.find((e) => e.name === "monitor").monitoringDuration).toBe(15000)
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("applies to this process only"))
      expect(readCfg()).toBe(CONFIG_YML)
    } finally {
      fs.chmodSync(tmpDir, 0o700)
    }
  })

  it("leaves the file untouched when the payload is rejected", async () => {
    const { updateConfig } = await loadFreshConfig()

    expect(updateConfig({ server: { data_dir: "/tmp/elsewhere" } }).success).toBe(false)
    expect(updateConfig({ epics: { monitor: { file_prefix: "../../pwn" } } }).success).toBe(false)
    expect(updateConfig({ epics: { cpu: { data_retention_mb: 0 } } }).success).toBe(false)

    expect(readCfg()).toBe(CONFIG_YML)
  })
})
