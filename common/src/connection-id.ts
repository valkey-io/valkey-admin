import { sanitizeUrl } from "./url-utils"

/**
 * Build the canonical Connection_Identifier for a (host, port, db) triple.
 *
 * The format is composed by sanitizing `host-port` via `sanitizeUrl` and
 * appending a deterministic `-db<index>` suffix. The output is a flat string
 * suitable for use as a Map key, route param, or directory-like segment.
 *
 * @param host - The Valkey node host (DNS name or IP).
 * @param port - The Valkey node port. Accepts a number or numeric string to
 *   match how `ConnectionDetails.port` is carried across the wire.
 * @param db - The Database_Index. Defaults to `0` when omitted.
 */
export const buildConnectionId = (
  host: string,
  port: number | string,
  db: number = 0,
): string => `${sanitizeUrl(`${host}-${port}`)}-db${db}`

/**
 * Strip the trailing `-db<N>` suffix from a Connection_Identifier so it
 * matches the db-less metrics-node-id (`nodeId`) format.
 *
 * Why this helper exists:
 *   - Connection_Identifiers (`<host>-<port>-db<N>`) carry `db` because each
 *     (host, port, db) is a distinct user-visible connection with its own
 *     Glide client.
 *   - Node-level metrics state (monitor status, sampler config, hot keys,
 *     command logs) and `metricsServerMap` are keyed by the db-less
 *     `<host>-<port>` because a metrics process is one OS process per Valkey
 *     node.
 *
 * Idempotent.
 *
 * @param id - A Connection_Identifier (or an already-db-less node id).
 */
export const toNodeId = (id: string): string => id.replace(/-db\d+$/, "")

/**
 * Type guard for the Database_Index. Returns true only for non-negative
 * integers; rejects negatives, non-integers, NaN, and non-numbers.
 */
export const isValidDatabaseIndex = (db: unknown): db is number =>
  typeof db === "number" && Number.isInteger(db) && db >= 0

/**
 * Validates it's nodeId (without the -db<number> suffix).
 * @param id Connection or Node id
 * @returns if id is not a connection id.
 */
export const isNodeId = (id: string): boolean =>
  id.length > 0 && id === toNodeId(id) && /^[a-zA-Z0-9_-]+$/.test(id)

/** A host and port in the form the server uses for identity, ids and clients. */
export type Endpoint = { host: string; port: number }

export class EndpointError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EndpointError"
  }
}

const PORT_PATTERN = /^[1-9][0-9]{0,4}$/

/**
 * Put a host and port into one canonical form, or throw `EndpointError`.
 *
 * The host is trimmed, lowercased, and loses one trailing dot. DNS and TLS
 * hostname checks ignore case, and certificates do not carry the dot, so these
 * spellings name the same server. IPv6 brackets stay as typed.
 *
 * The port must be canonical decimal in 1..65535. `"06379"`, `" 6379"` and
 * `"0x18eb"` are refused, not converted: `Number()` accepts them, which let one
 * server appear under many ids and gave the failed-AUTH limiter a fresh key
 * for each spelling.
 *
 * Both the frontend and the server call this before they build a
 * connectionId or an owner key, so the two sides agree on the id.
 */
export const normalizeEndpoint = (host: string, port: string | number): Endpoint => {
  const trimmed = (host ?? "").trim().toLowerCase().replace(/\.$/, "")
  if (trimmed.length === 0) throw new EndpointError("Enter a host.")
  const portText = typeof port === "number" ? String(port) : (port ?? "")
  if (!PORT_PATTERN.test(portText) || Number(portText) > 65535) {
    throw new EndpointError(`Enter a port between 1 and 65535 with no leading zeros (got ${JSON.stringify(port)}).`)
  }
  return { host: trimmed, port: Number(portText) }
}
