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
