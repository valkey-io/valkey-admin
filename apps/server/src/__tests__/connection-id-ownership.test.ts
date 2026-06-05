/**
 * CI/test guard for Requirement 1.4 of the db-aware-client-connections spec:
 *
 *   The Connection_Id_Builder (`buildConnectionId` in `common/src/connection-id.ts`)
 *   SHALL be the only function in the codebase that encodes the
 *   Connection_Identifier format. Frontend, Server, and shared packages SHALL
 *   invoke it instead of reimplementing the encoding.
 *
 * This test scans `apps/**` and `common/**` for the legacy host-port-pair
 * shape — a `sanitizeUrl(...)` call whose template literal contains exactly
 * two substitutions joined by a literal `-` — and fails when the call site
 * is not in the documented allow-list.
 *
 * Allow-listed exceptions are cluster topology / INFO host normalization sites
 * that are NOT Connection_Identifiers per the design (see design.md ->
 * "Migration: sanitizeUrl -> buildConnectionId"). They intentionally stay on
 * `sanitizeUrl` to avoid invalidating cluster topology state.
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// .../apps/server/src/__tests__ -> repo root is four levels up
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..")

const SCAN_ROOTS = ["apps", "common"]
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"])
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage"])

/**
 * Files where the host-port pair `sanitizeUrl` pattern is intentionally
 * retained per the design. Paths are repo-root-relative POSIX paths.
 *
 * - The shared helper itself defines the canonical encoding.
 * - Cluster topology / INFO host sites are not Connection_Identifiers.
 * - The metrics process keeps a local `sanitizeUrl` for non-identifier uses.
 */
const ALLOW_LIST: ReadonlySet<string> = new Set([
  // Canonical Connection_Id_Builder
  "common/src/connection-id.ts",
  // The underlying string sanitizer
  "common/src/url-utils.ts",
  // Cluster discovery primaryKey in `discoverCluster` (not a Connection_Identifier)
  "apps/server/src/connection.ts",
  // INFO host normalization in `parseClusterInfo` (not a Connection_Identifier)
  "apps/server/src/utils.ts",
  // Cluster topology node IDs (not a Connection_Identifier)
  "apps/server/src/metrics-orchestrator.ts",
  // Metrics process self-identifies as a topology node, not a Connection_Identifier:
  // its registration nodeId must match `clusterNodesRegistry` keys in
  // `apps/server/src/metrics-orchestrator.ts`, which use `sanitizeUrl(host-port)`.
  "apps/metrics/src/index.js",
  // Local `sanitizeUrl` definition kept for non-Connection_Identifier uses
  "apps/metrics/src/utils/helpers.js",
])

/**
 * Matches a host-port-pair-shaped `sanitizeUrl` call: a sanitizeUrl invocation
 * whose template literal contains exactly two substitutions joined by a
 * literal `-`. This is the legacy Connection_Identifier shape that we want
 * to block outside the canonical helper.
 */
const HOST_PORT_PATTERN = /sanitizeUrl\(\s*`[^`]*\$\{[^}]+\}-\$\{[^}]+\}[^`]*`\s*\)/

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      yield full
    }
  }
}

interface Offender {
  relPath: string
  line: number
  text: string
}

function findHostPortCallSites(): Offender[] {
  const offenders: Offender[] = []

  for (const root of SCAN_ROOTS) {
    const absRoot = path.join(REPO_ROOT, root)
    if (!fs.existsSync(absRoot)) continue

    for (const absFile of walk(absRoot)) {
      const relPath = path
        .relative(REPO_ROOT, absFile)
        .split(path.sep)
        .join("/")

      const contents = fs.readFileSync(absFile, "utf8")
      const lines = contents.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (HOST_PORT_PATTERN.test(line) && !ALLOW_LIST.has(relPath)) {
          offenders.push({ relPath, line: i + 1, text: line.trim() })
        }
      }
    }
  }

  return offenders
}

describe("Connection_Identifier ownership (Requirement 1.4)", () => {
  it("no host-port-shaped sanitizeUrl call exists outside the allow-list", () => {
    const offenders = findHostPortCallSites()

    assert.deepEqual(
      offenders,
      [],
      [
        "Found host-port-shaped `sanitizeUrl` call sites outside the allow-list.",
        "Use `buildConnectionId(host, port, db)` from",
        "`common/src/connection-id.ts` instead, or add the file to the allow-list",
        "in `apps/server/src/__tests__/connection-id-ownership.test.ts` if it is",
        "an intentional cluster-topology / INFO-host exception.",
        "",
        "Offending call sites:",
        ...offenders.map((o) => `  ${o.relPath}:${o.line}  ${o.text}`),
      ].join("\n"),
    )
  })

  it("every allow-listed file exists", () => {
    const missing: string[] = []
    for (const rel of ALLOW_LIST) {
      const abs = path.join(REPO_ROOT, rel)
      if (!fs.existsSync(abs)) missing.push(rel)
    }

    assert.deepEqual(
      missing,
      [],
      `Allow-listed files do not exist (update the allow-list): ${missing.join(", ")}`,
    )
  })
})
