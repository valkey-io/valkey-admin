import { diag, DiagLogLevel } from "@opentelemetry/api"
import { setGlobalErrorHandler } from "@opentelemetry/core"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto"
import { detectResources, envDetector, resourceFromAttributes } from "@opentelemetry/resources"
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { APP_VERSION } from "valkey-common"
import { isValidPollMs } from "../config-schema.js"
import { CPU, MEMORY } from "../utils/constants.js"
import { makeInfoCache } from "./info-cache.js"
import {
  CPU_METRICS,
  INSTRUMENT,
  KEYSPACE_METRICS,
  MEMORY_METRICS,
  cpuObservations,
  keyspaceObservations,
  memoryObservations
} from "./metric-registry.js"

// All OTel imports above are static on purpose. The Electron package ships only
// dist/index.cjs, so a dynamic import() would become a chunk that is not shipped.

const SHUTDOWN_TIMEOUT_MS = 2000
const ERROR_LOG_INTERVAL_MS = 60_000
const METER_NAME = "valkey-admin-metrics"

/** Export is on only for the literal string "true". */
export const isOtelEnabled = (env) => env?.METRICS_OTEL_ENABLED === "true"

/**
 * The export interval is the poll interval of the data it exports, so each
 * export carries one new sample. `poll_ms` is read once at start, as the
 * collectors do. An epic with an invalid `poll_ms` is skipped: a non-numeric
 * interval would make the SDK export about once a millisecond, and a value of
 * 0 or less makes the SDK throw at startup.
 */
export const exportIntervalMs = (cfg) => {
  const epics = cfg?.epics ?? []
  const pollMs = (name) => {
    const value = epics.find((epic) => epic.name === name)?.poll_ms
    return isValidPollMs(value) ? value : undefined
  }
  return pollMs(MEMORY) ?? pollMs(CPU) ?? null
}

/**
 * The resource that identifies this collector's Valkey node.
 *
 * Every attribute comes from the node, never from the process, so a collector
 * that the server restarts keeps exporting the same series.
 *
 * Cluster id: this collector exports one node and does not know its cluster, so
 * `service.namespace` is not set here. An operator can set it with
 * OTEL_RESOURCE_ATTRIBUTES. When collectors become one per cluster, the cluster
 * id goes here as `service.namespace`.
 */
export const buildResource = ({ env, nodeId }) => {
  const own = {
    "service.name": "valkey",
    "service.instance.id": nodeId,
    "db.system.name": "valkey",
    "server.address": env.VALKEY_HOST,
    "server.port": Number(env.VALKEY_PORT),
    ...(env.POD_NAME && { "k8s.pod.name": env.POD_NAME }),
    ...(env.POD_NAMESPACE && { "k8s.namespace.name": env.POD_NAMESPACE }),
  }
  // envDetector reads OTEL_RESOURCE_ATTRIBUTES and OTEL_SERVICE_NAME. The node
  // identity is merged last, so the environment cannot replace it.
  return detectResources({ detectors: [envDetector] }).merge(resourceFromAttributes(own))
}

// An error shows as its message, without the stack trace.
const describe = (arg) => arg?.message ?? String(arg)
// One line per error is enough in the log.
const firstLine = (args) => args.map(describe).join(" ").split("\n")[0]

/**
 * Adapts a collector logger to the OTel DiagLogger.
 *
 * Every collector writes its errors to stderr, and the server copies each
 * line into its own log. With the endpoint down, each collector would log one
 * error per interval, so errors are rate-limited: the first one is logged,
 * then at most one line per minute with the count of the errors in between.
 */
export const makeDiagLogger = (log, { now = Date.now } = {}) => {
  let lastErrorAt = null
  let skipped = 0
  return {
    error: (...args) => {
      const at = now()
      if (lastErrorAt !== null && at - lastErrorAt < ERROR_LOG_INTERVAL_MS) {
        skipped += 1
        return
      }
      const suffix = skipped > 0 ? ` (${skipped} more export errors since the last message)` : ""
      log.error(`${firstLine(args)}${suffix}`)
      lastErrorAt = at
      skipped = 0
    },
    warn: (...args) => log.warn(firstLine(args)),
    info: (...args) => log.info(firstLine(args)),
    debug: (...args) => log.debug(firstLine(args)),
    verbose: (...args) => log.debug(firstLine(args)),
  }
}

const CREATE_OBSERVABLE = {
  [INSTRUMENT.COUNTER]: (meter, name, options) => meter.createObservableCounter(name, options),
  [INSTRUMENT.UP_DOWN_COUNTER]: (meter, name, options) => meter.createObservableUpDownCounter(name, options),
  [INSTRUMENT.GAUGE]: (meter, name, options) => meter.createObservableGauge(name, options),
}

const createInstrument = (meter, { name, instrument, unit }) => CREATE_OBSERVABLE[instrument](meter, name, { unit })

/**
 * Starts the OTLP export of the cached INFO values.
 *
 * The instruments are observable: at each export the SDK calls back, and the
 * callback reads the latest cached values. When a fetch fails, the cache keeps
 * its last values, so the backend shows a flat line rather than a gap. The SDK
 * also keeps exporting the last value of an attribute set that a callback no
 * longer observes, so dropping stale entries here would not create a gap either.
 * See https://github.com/open-telemetry/opentelemetry-js/issues/4096 and
 * https://github.com/open-telemetry/opentelemetry-js/pull/6884, which would make
 * the SDK drop those series. With that fix, a staleness bound on the cache gives
 * a gap during a fetch outage.
 */
export const startOtelExporter = ({ intervalMs, resource, cache, log, exporter, now }) => {
  const diagLogger = makeDiagLogger(log, { now })
  diag.setLogger(diagLogger, { logLevel: DiagLogLevel.WARN, suppressOverrideMessage: true })
  // The SDK reports a failed export to its global error handler. The default
  // handler logs the error as JSON with its stack trace, so send it here instead.
  setGlobalErrorHandler((err) => diagLogger.error(err))

  const reader = new PeriodicExportingMetricReader({
    exporter: exporter ?? new OTLPMetricExporter(),
    exportIntervalMillis: intervalMs,
  })
  const meterProvider = new MeterProvider({ resource, readers: [reader] })
  const meter = meterProvider.getMeter(METER_NAME, APP_VERSION)

  const instruments = Object.fromEntries(
    [...MEMORY_METRICS, ...KEYSPACE_METRICS, ...CPU_METRICS].map((metric) => [metric.name, createInstrument(meter, metric)]),
  )

  let seenDbIndexes = new Set()
  meter.addBatchObservableCallback((result) => {
    const keyspace = keyspaceObservations(cache.keyspace() ?? {}, seenDbIndexes)
    seenDbIndexes = keyspace.seen
    const observations = [
      ...memoryObservations(cache.memory()),
      ...keyspace.observations,
      ...cpuObservations(cache.cpu()),
    ]
    observations.forEach(({ name, value, attributes }) => result.observe(instruments[name], value, attributes))
  }, Object.values(instruments))

  let shutdownPromise
  return {
    forceFlush: () => meterProvider.forceFlush(),
    // Idempotent: a signal and /connection/close can both shut the collector down.
    shutdown: () => {
      shutdownPromise ??= meterProvider.shutdown({ timeoutMillis: SHUTDOWN_TIMEOUT_MS })
        .catch((err) => log.warn(`OTel shutdown did not finish: ${describe(err)}`))
        .then(() => undefined)
      return shutdownPromise
    },
  }
}

/**
 * Starts the export when METRICS_OTEL_ENABLED is "true" and there is data to
 * export. Returns `null` otherwise, and nothing OTel-related is created.
 */
export const maybeStartOtel = ({ cfg, env, nodeId, log }) => {
  if (!isOtelEnabled(env)) return null

  const intervalMs = exportIntervalMs(cfg)
  if (intervalMs == null) {
    log.warn(`METRICS_OTEL_ENABLED is "true", but the config has no "${MEMORY}" or "${CPU}" epic with a valid poll_ms, so there is nothing to export.`)
    return null
  }

  const cache = makeInfoCache()
  let otel
  try {
    otel = startOtelExporter({ intervalMs, resource: buildResource({ env, nodeId }), cache, log })
  } catch (err) {
    // Export must never stop collection, so an SDK setup error turns export off.
    log.error(`OTel metrics export is off: it could not start: ${describe(err)}`)
    return null
  }
  log.info(`OTel metrics export is on, every ${intervalMs} ms`)

  return {
    onInfo: (kind, data) => {
      if (kind === MEMORY) cache.setMemory(data)
      else if (kind === CPU) cache.setCpu(data)
    },
    forceFlush: otel.forceFlush,
    shutdown: otel.shutdown,
  }
}
