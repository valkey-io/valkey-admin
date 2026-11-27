import { WebSocket } from "ws"
import {
  GlideClient,
  GlideClusterClient,
  Batch, ClusterBatch,
  RouteOption,
  ConnectionError,
  TimeoutError,
  ClosingError,
  Decoder,
  GlideReturnType,
  GlideString
} from "@valkey/valkey-glide"
import pLimit from "p-limit"
import { VALKEY, VALKEY_CLIENT } from "valkey-common"
import { formatBytes } from "valkey-common"
import { buildScanCommandArgs } from "./valkey-client-commands"

// Largest value the Key Browser renders before showing a size warning; override via env.
const keyValueSizeLimitBytes =
  Number(process.env.KEY_VALUE_SIZE_LIMIT_BYTES) || VALKEY_CLIENT.KEY_VALUE_SIZE_LIMIT_BYTES

/**
 * Indexes of binary elements in one page of a list, set, sorted set or hash.
 * They are relative to that page's `elements`.
 */
interface BinaryElementIndexes {
  binaryIndexes?: number[]; // indexes into list, set or sorted set `elements` that hold binary data, shown escaped.
  binaryKeyIndexes?: number[]; // indexes of hash elements whose field name is binary.
  binaryValueIndexes?: number[]; // indexes of hash elements whose value is binary.
}

interface EnrichedKeyInfo extends BinaryElementIndexes {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any; // this can be array, object, or string depending on the key type.
  elementsWarning?: string; // alternative for elements when they cannot be displayed.
  isBinary?: boolean;
  cursor?: string;
  binaryStreamParts?: BinaryStreamPart[]; // stream fields or values that are binary.
}

/**
 * Locates one binary field name or value inside a stream entry: `elements[entry].value[field]`.
 */
type BinaryStreamPart = { entry: number; field: number; part: "field" | "value" }

/**
 * Valkey strings are binary-safe, so a value may not be valid UTF-8. Strict decoding tells
 * text apart from binary: binary is escaped for display and flagged so edits can be blocked.
 */
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

/**
 * Decodes a reply as UTF-8 text, falling back to `\xNN` escapes when the bytes aren't valid UTF-8.
 * Numbers and booleans are stringified; an Error reply is rethrown.
 */
function decodeToStringValue(raw: GlideReturnType): { value: string; isBinary: boolean } {
  if (typeof raw === "string") return { value: raw, isBinary: false }
  if (typeof raw === "number" || typeof raw === "bigint" || typeof raw === "boolean") {
    return { value: String(raw), isBinary: false }
  }
  if (raw instanceof Error) throw raw
  if (!Buffer.isBuffer(raw)) {
    throw new TypeError(`Expected a string or Buffer reply, got ${typeof raw}`)
  }
  try {
    return { value: utf8Decoder.decode(raw), isBinary: false }
  } catch {
    const escaped = raw.reduce((s, byte) =>
      s + (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "\\x" + byte.toString(16).padStart(2, "0")), "",
    )
    return { value: escaped, isBinary: true }
  }
}

/**
 * Cursors, stream IDs and scores are always ASCII, so they are read as plain text.
 */
function toText(raw: GlideReturnType): string {
  return decodeToStringValue(raw).value
}

/**
 * Identifies an element by its raw bytes; escaped binary text isn't unique, so it can't be used for dedupe.
 */
function rawIdentity(raw: GlideReturnType): string {
  return Buffer.isBuffer(raw) ? raw.toString("latin1") : String(raw)
}

/**
 * Indexes of the items that pass `test`, or undefined when none do so the payload stays unchanged for text-only keys.
 */
function indexesWhere<T>(items: T[], test: (item: T) => boolean): number[] | undefined {
  const indexes = items.flatMap((item, i) => (test(item) ? [i] : []))
  return indexes.length > 0 ? indexes : undefined
}

/**
 * Splits decoded elements into the `elements` payload plus the indexes of the binary ones.
 */
function withBinaryIndexes<T>(decoded: { value: T; isBinary: boolean }[]): { elements: T[]; binaryIndexes?: number[] } {
  const binaryIndexes = indexesWhere(decoded, ({ isBinary }) => isBinary)
  return {
    elements: decoded.map(({ value }) => value),
    ...(binaryIndexes ? { binaryIndexes } : {}),
  }
}

type DecodedHashField = { value: { key: string; value: string }; isKeyBinary: boolean; isValueBinary: boolean }

/**
 * Splits decoded hash fields into the `elements` payload plus the indexes of binary field names and binary values,
 * so a text field holding a binary value can still be deleted by name.
 */
function withHashBinaryIndexes(decoded: DecodedHashField[]): {
  elements: { key: string; value: string }[]; binaryKeyIndexes?: number[]; binaryValueIndexes?: number[]
} {
  const binaryKeyIndexes = indexesWhere(decoded, ({ isKeyBinary }) => isKeyBinary)
  const binaryValueIndexes = indexesWhere(decoded, ({ isValueBinary }) => isValueBinary)
  return {
    elements: decoded.map(({ value }) => value),
    ...(binaryKeyIndexes ? { binaryKeyIndexes } : {}),
    ...(binaryValueIndexes ? { binaryValueIndexes } : {}),
  }
}

const pagedSizeCommands = new Map([
  ["hash", "HLEN"],
  ["set", "SCARD"],
  ["list", "LLEN"],
  ["zset", "ZCARD"],
])

interface ElementPage extends BinaryElementIndexes {
  collectionSize: number;
  elements: unknown[];
  cursor?: string;
}

/**
 * Reads one page of a set or hash with SSCAN/HSCAN, deduping by raw bytes.
 * Hash fields become `{ key, value }` pairs. Binary data is escaped; binary set members are listed in
 * `binaryIndexes`, binary hash field names in `binaryKeyIndexes` and binary hash values in `binaryValueIndexes`.
 */
async function scanPage(
  client: GlideClient | GlideClusterClient,
  key: string,
  isHash: boolean,
  cursor: string,
  count: number,
): Promise<Omit<ElementPage, "collectionSize">> {
  // Keyed by raw bytes so elements SCAN returns more than once are only kept once.
  const members = new Map<string, { value: string; isBinary: boolean }>()
  const hashFields = new Map<string, DecodedHashField>()
  const size = () => (isHash ? hashFields.size : members.size)
  let next = cursor
  do {
    const [newCursor, raw] = await client.customCommand([
      isHash ? "HSCAN" : "SSCAN", key, next, "COUNT", count.toString(),
    ], { decoder: Decoder.Bytes }) as [GlideReturnType, GlideReturnType[]]
    if (isHash) {
      // Hash replies are a flat [field1, value1, ...] array.
      for (let i = 0; i < raw.length; i += 2) {
        const field = decodeToStringValue(raw[i])
        const value = decodeToStringValue(raw[i + 1])
        hashFields.set(rawIdentity(raw[i]), {
          value: { key: field.value, value: value.value },
          isKeyBinary: field.isBinary,
          isValueBinary: value.isBinary,
        })
      }
    } else {
      raw.forEach((member) => members.set(rawIdentity(member), decodeToStringValue(member)))
    }
    next = toText(newCursor)
  } while (next !== "0" && size() < count)

  return {
    ...(isHash
      ? withHashBinaryIndexes(Array.from(hashFields.values()))
      : withBinaryIndexes(Array.from(members.values()))),
    cursor: next === "0" ? undefined : next,
  }
}

type RawZSetMember = { key: GlideString; value: GlideReturnType }

/**
 * Scores arrive as numbers (RESP3 doubles) or, from older servers, as bulk strings.
 */
function decodeScore(raw: GlideReturnType): string | number {
  return Buffer.isBuffer(raw) ? toText(raw) : raw as string | number
}

/**
 * Reads one page of a hash, set, list or sorted set, starting at `cursor`.
 * Hashes and sets page with a SCAN cursor; lists and sorted sets with a start index.
 * Binary elements are escaped and their indexes within this page are returned alongside.
 */
async function fetchElementPage(
  client: GlideClient | GlideClusterClient,
  key: string,
  type: string,
  cursor = "0",
  count: number = VALKEY_CLIENT.ELEMENT_PAGE_SIZE,
): Promise<ElementPage> {
  const keyType = type.toLowerCase()
  const sizeCmd = pagedSizeCommands.get(keyType)
  if (!sizeCmd) throw new Error(`Pagination not supported for key type: ${type}`)
  const pageSize = Number.isInteger(count) ? Math.max(count, VALKEY_CLIENT.ELEMENT_PAGE_SIZE) : VALKEY_CLIENT.ELEMENT_PAGE_SIZE
  const getSize = client.customCommand([sizeCmd, key]) as Promise<number>

  if (keyType === "hash" || keyType === "set") {
    const [collectionSize, page] = await Promise.all([getSize, scanPage(client, key, keyType === "hash", cursor, pageSize)])
    return { collectionSize, ...page }
  }

  const start = Number(cursor)
  const rangeArgs = keyType === "list"
    ? ["LRANGE", key, start.toString(), (start + pageSize - 1).toString()]
    : ["ZRANGE", key, start.toString(), (start + pageSize - 1).toString(), "WITHSCORES"]
  const [collectionSize, page] = await Promise.all([
    getSize, client.customCommand(rangeArgs, { decoder: Decoder.Bytes }),
  ]) as [number, GlideReturnType[] | null]
  const raw = page ?? []
  const decoded = keyType === "list"
    ? withBinaryIndexes(raw.map((element) => decodeToStringValue(element)))
    : withBinaryIndexes((raw as unknown as RawZSetMember[]).map(({ key: member, value: score }) => {
      const { value, isBinary } = decodeToStringValue(member)
      return { value: { key: value, value: decodeScore(score) }, isBinary }
    }))
  const next = start + raw.length

  return { collectionSize, ...decoded, cursor: raw.length > 0 && next < collectionSize ? next.toString() : undefined }
}

/**
 * Loads the first page of a hash, set, list or sorted set; the rest is fetched on demand with `getKeyElements`.
 */
async function getPagedKeyInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  count?: number,
): Promise<EnrichedKeyInfo> {
  try {
    return { ...keyInfo, ...await fetchElementPage(client, keyInfo.name, keyInfo.type, "0", count) }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return { ...keyInfo, elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE }
  }
}

type StreamEntry = { key: string; value: [string, string][] }

type DecodedStreamEntry = { value: StreamEntry; id: string; binaryParts: Omit<BinaryStreamPart, "entry">[] }

/**
 * GLIDE returns entries as { key: id, value: [[field, value], ...] }; plain RESP arrays are [id, [field, value, ...]].
 * Both are normalized to the GLIDE shape. Each binary field name or value is recorded in `binaryParts`.
 */
function decodeStreamEntry(raw: GlideReturnType): DecodedStreamEntry {
  const binaryParts: Omit<BinaryStreamPart, "entry">[] = []
  const decodePair = (rawField: GlideReturnType, rawValue: GlideReturnType, field: number): [string, string] => {
    const decodedField = decodeToStringValue(rawField)
    const decodedValue = decodeToStringValue(rawValue)
    if (decodedField.isBinary) binaryParts.push({ field, part: "field" })
    if (decodedValue.isBinary) binaryParts.push({ field, part: "value" })
    return [decodedField.value, decodedValue.value]
  }

  if (Array.isArray(raw)) {
    const [rawId, rawFields] = raw as [GlideReturnType, GlideReturnType[]]
    const id = toText(rawId)
    const fields: [string, string][] = []
    for (let i = 0; i < rawFields.length; i += 2) {
      fields.push(decodePair(rawFields[i], rawFields[i + 1], i / 2))
    }
    return { value: { key: id, value: fields }, id, binaryParts }
  }

  const { key, value } = raw as { key: GlideReturnType; value: GlideReturnType[][] }
  const id = toText(key)
  const fields = value.map(([field, fieldValue], i) => decodePair(field, fieldValue, i))
  return { value: { key: id, value: fields }, id, binaryParts }
}

/**
 * Splits decoded stream entries into the `elements` payload plus the location of every binary field name or value.
 */
function withStreamBinaryParts(decoded: DecodedStreamEntry[]): { elements: StreamEntry[]; binaryStreamParts?: BinaryStreamPart[] } {
  const binaryStreamParts = decoded.flatMap(({ binaryParts }, entry) => binaryParts.map((part) => ({ entry, ...part })))
  return {
    elements: decoded.map(({ value }) => value),
    ...(binaryStreamParts.length > 0 ? { binaryStreamParts } : {}),
  }
}

/**
 * Loads a stream with XRANGE one page at a time, resuming after the last entry ID.
 * Binary field names and values are escaped and located in `binaryStreamParts`.
 */
async function getPaginatedStreamInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  commands: { sizeCmd: string; elementsCmd: string[] },
): Promise<EnrichedKeyInfo> {
  try {
    const [firstPage, collectionSize] = await Promise.all([
      client.customCommand(
        [...commands.elementsCmd, "-", "+", "COUNT", VALKEY_CLIENT.ELEMENT_PAGE_SIZE.toString()], { decoder: Decoder.Bytes },
      ),
      client.customCommand([commands.sizeCmd, keyInfo.name]),
    ]) as [GlideReturnType[], number]

    const results = firstPage.map(decodeStreamEntry)

    if (firstPage.length === VALKEY_CLIENT.ELEMENT_PAGE_SIZE) {
      // The prefix makes the range exclusive, so the last entry isn't re-fetched on the next page
      // See: https://valkey.io/commands/xrange/
      let cursor = `(${results[results.length - 1].id}`

      while (true) {
        const entries = await client.customCommand([
          ...commands.elementsCmd, cursor, "+", "COUNT", VALKEY_CLIENT.ELEMENT_PAGE_SIZE.toString(),
        ], { decoder: Decoder.Bytes }) as GlideReturnType[]
        if (!entries || entries.length === 0) break
        results.push(...entries.map(decodeStreamEntry))
        if (entries.length < VALKEY_CLIENT.ELEMENT_PAGE_SIZE) break
        cursor = `(${results[results.length - 1].id}`
      }
    }

    return { ...keyInfo, collectionSize, ...withStreamBinaryParts(results) }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return { ...keyInfo, elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE }
  }
}

// JSON queries give back the value inside an array, like [value]. This returns just the value
function getJsonPathType<T>(result: unknown): T {
  return (Array.isArray(result) ? result[0] : result) as T
}

async function getPaginatedJsonInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  commands: { sizeCmd: string; elementsCmd: string[] },
): Promise<EnrichedKeyInfo> {
  try {
    // Check the shape first, then read it the cheapest way
    const rootType = getJsonPathType<string>(
      await client.customCommand(["JSON.TYPE", keyInfo.name, "$"]),
    )

    // if array read it in slices, a page at a time
    if (rootType === "array") {
      const length = getJsonPathType<number>(
        await client.customCommand(["JSON.ARRLEN", keyInfo.name, "$"]),
      )
      const elements: unknown[] = []
      for (let start = 0; start < length; start += VALKEY_CLIENT.ELEMENT_PAGE_SIZE) {
        const slice = await client.customCommand([
          ...commands.elementsCmd, `$[${start}:${start + VALKEY_CLIENT.ELEMENT_PAGE_SIZE}]`,
        ]) as string
        // slice is already a flat array of items, so we don't unwrap it
        const parsed = JSON.parse(slice) as unknown[]
        if (!Array.isArray(parsed) || parsed.length === 0) break
        elements.push(...parsed)
      }
      return { ...keyInfo, collectionSize: length, elements: JSON.stringify(elements) }
    }

    // if object get the field names, then fetch one value at a time
    if (rootType === "object") {
      const keys = getJsonPathType<string[]>(
        await client.customCommand(["JSON.OBJKEYS", keyInfo.name, "$"]),
      )
      const obj: Record<string, unknown> = {}
      for (const field of keys) {
        // quote the field name so any characters in it are safe
        const value = await client.customCommand([
          ...commands.elementsCmd, `$[${JSON.stringify(field)}]`,
        ]) as string
        obj[field] = getJsonPathType(JSON.parse(value))
      }
      return { ...keyInfo, collectionSize: keys.length, elements: JSON.stringify(obj) }
    }

    // anything else (string, number, etc.) we just read it in one go
    const value = await client.customCommand([...commands.elementsCmd]) as string
    return { ...keyInfo, elements: value }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return { ...keyInfo, elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE }
  }
}

/**
 * Reads a whole value in one command (e.g. GET); binary values are escaped and flagged with `isBinary`.
 */
async function getFullKeyInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  commands: { sizeCmd: string; elementsCmd: string[] },
): Promise<EnrichedKeyInfo> {
  try {
    const [raw, collectionSize] = await Promise.all([
      client.customCommand(commands.elementsCmd, { decoder: Decoder.Bytes }),
      commands.sizeCmd ? client.customCommand([commands.sizeCmd, keyInfo.name]) : undefined,
    ])
    if (raw == null) return keyInfo

    const { value, isBinary } = decodeToStringValue(raw)
    return {
      ...keyInfo,
      ...(commands.sizeCmd ? { collectionSize: collectionSize as number } : {}),
      elements: value,
      ...(isBinary ? { isBinary } : {}),
    }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return keyInfo
  }
}

type KeyMetadata = { type: string; ttl: number; size: number | null }

async function fetchSingleKeyMetadata(client: GlideClient | GlideClusterClient, key: string): Promise<KeyMetadata> {
  const [type, ttl, size] = await Promise.all([
    client.customCommand(["TYPE", key]) as Promise<string>,
    client.customCommand(["TTL", key]).catch(() => -1) as Promise<number>,
    client.customCommand(["MEMORY", "USAGE", key]).catch(() => null) as Promise<number | null>,
  ])
  return { type, ttl, size }
}

const { PIPELINE_CHUNK_SIZE } = VALKEY_CLIENT

async function fetchKeyMetadataBatch(client: GlideClient | GlideClusterClient, keys: string[]): Promise<KeyMetadata[]> {
  const BatchClass = client instanceof GlideClusterClient ? ClusterBatch : Batch
  const results: GlideReturnType[] = []

  for (let i = 0; i < keys.length; i += PIPELINE_CHUNK_SIZE) {
    const chunk = keys.slice(i, i + PIPELINE_CHUNK_SIZE)
    const batch = new BatchClass(false)
    for (const key of chunk) {
      batch.customCommand(["TYPE", key])
      batch.customCommand(["TTL", key])
      batch.customCommand(["MEMORY", "USAGE", key])
    }
    const chunkResults = await client.exec(batch) as GlideReturnType[]
    results.push(...chunkResults)
  }

  return keys.map((_, i) => {
    const [type, ttl, size] = results.slice(i * 3, i * 3 + 3)
    return { type: (type ?? "unknown") as string, ttl: (ttl ?? -1) as number, size: (size ?? null) as number | null }
  })
}

export async function getKeyInfo(
  client: GlideClient | GlideClusterClient,
  key: string,
  metadata?: KeyMetadata,
  count?: number,
): Promise<EnrichedKeyInfo> {
  try {
    const { type: keyType, ttl, size: memoryUsage } = metadata ?? await fetchSingleKeyMetadata(client, key)

    const keyInfo: EnrichedKeyInfo = {
      name: key,
      type: keyType,
      ttl: ttl,
      size: memoryUsage || -1,
    }

    if (pagedSizeCommands.has(keyType.toLowerCase())) {
      return await getPagedKeyInfo(client, keyInfo, count)
    }

    // Get collection size and elements for each type
    const elementCommands: Record<
      string,
      { sizeCmd: string; elementsCmd: string[] }
    > = {
      stream: { sizeCmd: "XLEN", elementsCmd: ["XRANGE", key] },
      "rejson-rl": { sizeCmd: "", elementsCmd: ["JSON.GET", key] },
      string: { sizeCmd: "", elementsCmd: ["GET", key] },
    }

    const commands = elementCommands[keyType.toLowerCase()]
    if (!commands) {
      console.log(`Could not get commands for key type ${keyType.toLowerCase()}`)
      return keyInfo
    }

    if (memoryUsage > keyValueSizeLimitBytes) {
      if (commands.sizeCmd){
        keyInfo.collectionSize = await (client.customCommand([commands.sizeCmd, key])) as number
      }
      keyInfo.elementsWarning = `This key is ${formatBytes(memoryUsage)}, which is larger than the maximum display size of ${formatBytes(keyValueSizeLimitBytes)}.`

      return keyInfo
    }

    switch (keyType.toLowerCase()) {
      case "stream":
        return await getPaginatedStreamInfo(client, keyInfo, commands)
      case "rejson-rl":
        return await getPaginatedJsonInfo(client, keyInfo, commands)
      default:
        return await getFullKeyInfo(client, keyInfo, commands)
    }

  } catch (err) {
    console.error("Error getting key", err)
    return {
      name: key,
      type: "unknown",
      ttl: -1,
      size: -1,
    }
  }
}

async function scanStandalone(
  client: GlideClient,
  payload: {
    connectionId: string;
    pattern?: string;
    count?: number;
  }, 
): Promise<Set<string>> {
  const allKeys = new Set<string>()
    
  let cursor = "0"
  do {
    const scanResult = (await client.customCommand(
      buildScanCommandArgs({ cursor, pattern: payload.pattern, count: payload.count }),
    )) as [string, string[]]

    const [newCursor, keys] = scanResult

    cursor = newCursor
    keys.forEach((key) => {allKeys.add(key)})
  } while (allKeys.size < 1000 && cursor !== "0")

  return allKeys
}

type ClusterScanResult = {
  key: string
  value:[string, string[]]
}

async function scanCluster(
  client: GlideClusterClient,
  payload: {
    connectionId: string;
    pattern?: string;
    count?: number;
    limit?: number; 
  },
): Promise<Set<string>> {

  const routeOption: RouteOption = { route: "allPrimaries" }
  const allKeys = new Set<string>()
  const limit = payload.limit ?? 1000

  // Run initial SCAN 0 on all primaries
  const scanClusterResult = await client.customCommand(
    buildScanCommandArgs({
      cursor: "0",
      pattern: payload.pattern,
      count: payload.count,
    }),
    routeOption,
  ) as ClusterScanResult[]

  await Promise.all(
    scanClusterResult.map(async ({ key: nodeAddress, value }) => {
      let cursor = value[0]
      const keys = value[1]

      keys.forEach((k) => {
        if (allKeys.size < limit) allKeys.add(k)
      })

      const [host, portStr] = nodeAddress.split(/:(?=[^:]+$)/) // split on last ":"
      const nodeRouteOption: RouteOption = {
        route: {
          type: "routeByAddress",
          host,
          port: Number(portStr),
        },
      }
      while (cursor !== "0" && allKeys.size < limit) {
        const [nextCursor, newKeys] = await client.customCommand(
          buildScanCommandArgs({
            cursor,
            pattern: payload.pattern,
            count: payload.count,
          }),
          nodeRouteOption,
        ) as [string, string[]]

        cursor = nextCursor
        newKeys.forEach((k) => { if (allKeys.size < limit) allKeys.add(k) })
      }
    }),
  )

  return allKeys
}

const limit = pLimit(10) 
export async function getKeys(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    pattern?: string;
    count?: number;
  },
) {
  const { connectionId } = payload
  try {
    const totalKeys = await client.customCommand(["DBSIZE"])
    const allKeys = client instanceof GlideClusterClient ? await scanCluster(client, payload) : await scanStandalone(client, payload)
    const keyList = [...allKeys]

    const metadata = await fetchKeyMetadataBatch(client, keyList)

    const enrichedKeys = await Promise.all(
      keyList.map((key, i) =>
        limit(() => getKeyInfo(client, key, metadata[i]).catch(() => ({
          name: key,
          type: "unknown",
          ttl: -1,
          size: -1,
        }))),
      ),
    )

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeysFulfilled,
        payload: {
          connectionId: connectionId,
          keys: enrichedKeys,
          totalKeys,
        },
      }),
    )
  } catch (err) {
    console.error(`Valkey connection error for ${connectionId}:`, err)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeysFailed,
        payload: {
          connectionId: connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId,
            errorMessage: "Error getting keys - Valkey instance could be down",
            shouldRetry: true,
          },
        }),
      )
    }
  }
}

export async function getKeyInfoSingle(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    key: string;
  },
) {
  const { connectionId } = payload
  try {
    const keyInfo = await getKeyInfo(client, payload.key)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeyTypeFulfilled,
        payload: {
          connectionId,
          key: payload.key,
          ...keyInfo,
        },
      }),
    )
  } catch (err) {
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeyTypeFailed,
        payload: {
          connectionId,
          key: payload.key,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      console.error(`Valkey connection error for ${connectionId}:`, err)
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId,
            errorMessage: "Error getting key info - Valkey instance could be down",
            shouldRetry: true,
          },
        }),
      )
    }
  }
}

export async function getKeyElements(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: { connectionId: string; key: string; keyType: string; cursor: string },
) {
  const { connectionId, key, keyType, cursor } = payload
  try {
    const { cursor: nextCursor, ...page } = await fetchElementPage(client, key, keyType, cursor)
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeyElementsFulfilled,
        payload: {
          connectionId,
          key,
          cursor,
          nextCursor,
          ...page, // elements, collectionSize and this page's binary indexes
        },
      }),
    )
  } catch (err) {
    console.error(`Error getting elements for key ${key}:`, err)
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeyElementsFailed,
        payload: {
          connectionId,
          key,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )
  }
}

export async function deleteKey(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: { connectionId: string; key: string },
) {
  const connectionId = payload.connectionId
  try {
    // Using UNLINK for non-blocking deletion, DEL is also an option but can block
    const result = (await client.customCommand([
      "UNLINK",
      payload.key,
    ])) as number

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.deleteKeyFulfilled,
        payload: {
          connectionId,
          key: payload.key,
          deleted: result === 1,
        },
      }),
    )
  } catch (err) {

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.deleteKeyFailed,
        payload: {
          connectionId,
          key: payload.key,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      console.error(`Valkey connection error for ${connectionId}:`, err)
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId,
            errorMessage: "Error deleting key - Valkey instance could be down",
            shouldRetry: true,
          },
        }),
      )
    }
  }
}

// functions for adding different key types
async function addStringKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  value: string,
  ttl?: number,
) {
  const expiry = ttl && ttl > 0 ? ["EX", ttl.toString()] : []
  const reply = await client.customCommand(["SET", key, value, "NX", ...expiry])
  if (reply === null) {
    throw new Error(`Key "${key}" already exists`)
  }
}

async function addHashKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  fields: { field: string; value: string }[],
  ttl?: number,
) {
  const hsetCommand = ["HSET", key]
  fields.forEach(({ field, value }) => {
    hsetCommand.push(field, value)
  })

  await client.customCommand(hsetCommand)
  if (ttl && ttl > 0) {
    await client.customCommand(["EXPIRE", key, ttl.toString()])
  }
}

async function addListKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  values: string[],
  ttl?: number,
) {
  const rpushArgs = ["RPUSH", key, ...values]
  await client.customCommand(rpushArgs)

  if (ttl && ttl > 0) {
    await client.customCommand(["EXPIRE", key, ttl.toString()])
  }
}

async function addSetKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  values: string[],
  ttl?: number,
) {

  const saddArgs = ["SADD", key, ...values]
  await client.customCommand(saddArgs)

  if (ttl && ttl > 0) {
    await client.customCommand(["EXPIRE", key, ttl.toString()])
  }

}

async function addZSetKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  members: { key: string; value: number }[],
  ttl?: number,
) {
  const zaddArgs = ["ZADD", key]
  members.forEach(({ key: member, value: score }) => {
    zaddArgs.push(score.toString(), member)
  })

  await client.customCommand(zaddArgs)

  if (ttl && ttl > 0) {
    await client.customCommand(["EXPIRE", key, ttl.toString()])
  }
}

async function addStreamKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  fields: { field: string; value: string }[],
  entryId?: string,
  ttl?: number,
) {
  const xaddArgs = ["XADD", key, entryId && entryId.trim() ? entryId.trim() : "*"]
  fields.forEach(({ field, value }) => {
    xaddArgs.push(field, value)
  })

  await client.customCommand(xaddArgs)

  if (ttl && ttl > 0) {
    await client.customCommand(["EXPIRE", key, ttl.toString()])
  }
}

async function addJsonKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  value: string,
  ttl?: number,
) {
  const reply = await client.customCommand(["JSON.SET", key, "$", value, "NX"])
  if (reply === null) {
    throw new Error(`Key "${key}" already exists`)
  }

  if (ttl && ttl > 0) {
    await client.customCommand(["EXPIRE", key, ttl.toString()])
  }
}

export async function addKey(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    key: string;
    keyType: string;
    value?: string; // for string type
    fields?: { field: string; value: string }[]; // for hash and stream types
    values?: string[]; // for list, set types
    zsetMembers?: { key: string; value: number }[]; // for zset type
    streamEntryId?: string; // for stream type
    ttl?: number;
  },
) {
  const connectionId = payload.connectionId
  try {
    const keyType = payload.keyType.toLowerCase().trim()
    switch (keyType) {
      case "string":
        if (!payload.value) {
          throw new Error("Value is required for string type")
        }
        await addStringKey(client, payload.key, payload.value, payload.ttl)
        break

      case "hash":
        if (!payload.fields || payload.fields.length === 0) {
          throw new Error("Fields are required for hash type")
        }
        await addHashKey(client, payload.key, payload.fields, payload.ttl)
        break

      case "list":
        if (!payload.values || payload.values.length === 0) {
          throw new Error("At least one value is required for list type")
        }
        await addListKey(client, payload.key, payload.values, payload.ttl)
        break
      case "set":
        if (!payload.values || payload.values.length === 0) {
          throw new Error("At least one value is required for set type")
        }
        await addSetKey(client, payload.key, payload.values, payload.ttl)
        break
      case "zset":
        if (!payload.zsetMembers || payload.zsetMembers.length === 0) {
          throw new Error("At least one member is required for zset type")
        }
        await addZSetKey(client, payload.key, payload.zsetMembers, payload.ttl)
        break
      case "stream":
        if (!payload.fields || payload.fields.length === 0) {
          throw new Error("At least one field is required for stream type")
        }
        await addStreamKey(client, payload.key, payload.fields, payload.streamEntryId, payload.ttl)
        break

      case "json":
        if (!payload.value) {
          throw new Error("Value is required for JSON type")
        }
        await addJsonKey(client, payload.key, payload.value, payload.ttl)
        break

      default:
        throw new Error(`Unsupported key type: ${payload.keyType}`)
    }

    const keyInfo = await getKeyInfo(client, payload.key)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.addKeyFulfilled,
        payload: {
          connectionId,
          key: keyInfo,
          message: "Key added successfully",
        },
      }),
    )
  } catch (err) {
    console.error(`Valkey connection error for ${connectionId}:`, err)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.addKeyFailed,
        payload: {
          connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      console.error(`Valkey connection error for ${connectionId}:`, err)
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId,
            errorMessage: "Error adding key - Valkey instance could be down",
            shouldRetry: true,
          },
        }),
      )
    }
  }
}

// functions for updatin/editing different key types
// Note : the update and add functions are quite similar MAYBE can be refactored later
/**
 * Overwrites a string key, keeping its TTL unless a new one is given.
 * Refuses keys holding binary data, since saving the escaped text would corrupt them.
 */
async function updateStringKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  value: string,
  ttl?: number,
) {
  const current = await client.customCommand(["GET", key], { decoder: Decoder.Bytes })
  if (current != null && decodeToStringValue(current).isBinary) {
    throw new Error("This key holds binary data and cannot be edited as text.")
  }

  if (ttl && ttl > 0) {
    await client.customCommand(["SETEX", key, ttl.toString(), value])
  } else {
    await client.customCommand(["SET", key, value, "KEEPTTL"])
  }
}

async function updateJsonKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  value: string,
  ttl?: number,
) {
  await client.customCommand(["JSON.SET", key, "$", value])

  if (ttl && ttl > 0) {
    await client.customCommand(["EXPIRE", key, ttl.toString()])
  }
}

/**
 * Deletes and sets hash fields, then applies a new TTL if given.
 * Refuses fields that currently hold binary data, since saving the escaped text would corrupt them.
 */
async function updateHashKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  fields: { field: string; value: string }[],
  ttl?: number,
  deletedHashFields?: string[],
) {
  console.debug("delete hash fields:::", deletedHashFields)
  console.debug("update hash fields:::", fields)
  const names = (fields ?? []).map(({ field }) => field)
  if (names.length > 0) {
    const current = await client.customCommand(["HMGET", key, ...names], { decoder: Decoder.Bytes }) as GlideReturnType[]
    const binary = names.filter((_, i) => current?.[i] != null && decodeToStringValue(current[i]).isBinary)
    if (binary.length > 0) throw new Error(`Fields ${binary.join(", ")} hold binary data and cannot be edited as text.`)
  }

  // first delete fields if any
  if (deletedHashFields && deletedHashFields.length > 0) {
    const hdelCommand = ["HDEL", key, ...deletedHashFields]
    await client.customCommand(hdelCommand)
  }

  // then update fields
  if (fields && fields.length > 0) {
    const hsetCommand = ["HSET", key]
    fields.forEach(({ field, value }) => {
      hsetCommand.push(field, value)
    })
    await client.customCommand(hsetCommand)
  }

  if (ttl && ttl > 0) {
    await client.customCommand(["EXPIRE", key, ttl.toString()])
  }
}

/**
 * Sets, removes and appends list elements in one batch, then applies a new TTL if given.
 * Refuses updates to elements that currently hold binary data, since saving the escaped text would corrupt them.
 */
async function updateListKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  updates: { index: number; value: string }[],
  ttl?: number,
  deletedListItems?: { index: number; value: string }[],
  newListItems?: string[],
) {
  if (updates && updates.length > 0) {
    const current = await Promise.all(updates.map(({ index }) =>
      client.customCommand(["LINDEX", key, index.toString()], { decoder: Decoder.Bytes }),
    ))
    const binary = updates.filter((_, i) => current[i] != null && decodeToStringValue(current[i]).isBinary)
    if (binary.length > 0) {
      throw new Error(`Elements at index ${binary.map(({ index }) => index).join(", ")} hold binary data and cannot be edited as text.`)
    }
  }

  if (client instanceof GlideClient) {
    const batch = new Batch(true)

    // first update items, while indexes still match the ones checked by LINDEX above
    if (updates && updates.length > 0) {
      updates.forEach(({ index, value }) =>
        batch.customCommand(["LSET", key, index.toString(), value]),
      )
    }

    // then delete items (sorted by index descending to avoid index shifting issues)
    if (deletedListItems && deletedListItems.length > 0) {
      const sortedDeletes = [...deletedListItems].sort((a, b) => b.index - a.index)
      sortedDeletes.forEach(({ value }) => {
        batch.customCommand(["LREM", key, "1", value])
      })
    }

    // then add new items to the end of the list
    if (newListItems && newListItems.length > 0) {
      batch.customCommand(["RPUSH", key, ...newListItems])
    }

    if (ttl && ttl > 0) {
      batch.customCommand(["EXPIRE", key, ttl.toString()])
    }

    await client.exec(batch, true)
  } else if (client instanceof GlideClusterClient) {
    const batch = new ClusterBatch(true)

    if (updates && updates.length > 0) {
      updates.forEach(({ index, value }) =>
        batch.customCommand(["LSET", key, index.toString(), value]),
      )
    }

    if (deletedListItems && deletedListItems.length > 0) {
      const sortedDeletes = [...deletedListItems].sort((a, b) => b.index - a.index)
      sortedDeletes.forEach(({ value }) => {
        batch.customCommand(["LREM", key, "1", value])
      })
    }

    // then add new items to the end of the list
    if (newListItems && newListItems.length > 0) {
      batch.customCommand(["RPUSH", key, ...newListItems])
    }

    if (ttl && ttl > 0) {
      batch.customCommand(["EXPIRE", key, ttl.toString()])
    }

    await client.exec(batch, true)
  } else {
    throw new Error("Unsupported client type")
  }
}

async function updateSetKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  updates: { oldValue: string; newValue: string }[],
  ttl?: number,
  deletedSetItems?: string[],
  newSetItems?: string[],
) {
  if (client instanceof GlideClient) {
    const batch = new Batch(true)

    // first delete items if any
    if (deletedSetItems && deletedSetItems.length > 0) {
      deletedSetItems.forEach((value) => {
        batch.customCommand(["SREM", key, value])
      })
    }

    // then update items
    if (updates && updates.length > 0) {
      for (const { oldValue, newValue } of updates) {
        batch.customCommand(["SREM", key, oldValue])
        batch.customCommand(["SADD", key, newValue])
      }
    }

    // then add new items
    if (newSetItems && newSetItems.length > 0) {
      batch.customCommand(["SADD", key, ...newSetItems])
    }

    if (ttl && ttl > 0) {
      batch.customCommand(["EXPIRE", key, ttl.toString()])
    }

    await client.exec(batch, true)
  }
  else if (client instanceof GlideClusterClient) {
    const batch = new ClusterBatch(true)

    if (deletedSetItems && deletedSetItems.length > 0) {
      deletedSetItems.forEach((value) => {
        batch.customCommand(["SREM", key, value])
      })
    }

    if (updates && updates.length > 0) {
      for (const { oldValue, newValue } of updates) {
        batch.customCommand(["SREM", key, oldValue])
        batch.customCommand(["SADD", key, newValue])
      }
    }

    // then add new items
    if (newSetItems && newSetItems.length > 0) {
      batch.customCommand(["SADD", key, ...newSetItems])
    }

    if (ttl && ttl > 0) {
      batch.customCommand(["EXPIRE", key, ttl.toString()])
    }

    await client.exec(batch, true)
  } else {
    throw new Error("Unsupported client type")
  }
}

async function updateZSetKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  updates: { member: string; score: number }[],
  ttl?: number,
) {
  if (client instanceof GlideClient) {
    const batch = new Batch(true)

    for (const { member, score } of updates) {
      batch.customCommand(["ZADD", key, score.toString(), member])
    }

    if (ttl && ttl > 0) {
      batch.customCommand(["EXPIRE", key, ttl.toString()])
    }

    await client.exec(batch, true)
  } else if (client instanceof GlideClusterClient) {
    const batch = new ClusterBatch(true)

    for (const { member, score } of updates) {
      batch.customCommand(["ZADD", key, score.toString(), member])
    }

    if (ttl && ttl > 0) {
      batch.customCommand(["EXPIRE", key, ttl.toString()])
    }

    await client.exec(batch, true)
  } else {
    throw new Error("Unsupported client type")
  }
}

export async function updateKey(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    key: string;
    keyType: string;
    value?: string; // for string type
    fields?: { field: string; value: string }[]; // for hash type
    deletedHashFields?: string[]; // for hash type - fields to delete
    listUpdates?: { index: number; value: string }[]; // for list type
    deletedListItems?: { index: number; value: string }[]; // for list type - items to delete
    newListItems?: string[]; // for list type - new items to add
    setUpdates?: { oldValue: string; newValue: string }[]; // for set type
    deletedSetItems?: string[]; // for set type - items to delete
    newSetItems?: string[]; // for set type - new items to add
    zsetUpdates?: { member: string; score: number }[]; // for zset type
    ttl?: number;
    count?: number;
  },
) {
  const connectionId = payload.connectionId
  try {
    const keyType = payload.keyType.toLowerCase().trim()

    switch (keyType) {
      case "string":
        if (!payload.value) {
          throw new Error("Value is required for string type")
        }
        await updateStringKey(client, payload.key, payload.value, payload.ttl)
        break
      case "hash":
        if ((payload.fields && payload.fields.length > 0) || (payload.deletedHashFields && payload.deletedHashFields.length > 0)) {
          await updateHashKey(client, payload.key, payload.fields || [], payload.ttl, payload.deletedHashFields)
          break
        } else {
          throw new Error("Fields or deletedHashFields are required for hash type")
        }
      case "list":
        if ((!payload.listUpdates || payload.listUpdates.length === 0) &&
            (!payload.deletedListItems || payload.deletedListItems.length === 0) &&
            (!payload.newListItems || payload.newListItems.length === 0)) {
          throw new Error("List updates, deletedListItems, or newListItems are required for list type")
        }
        await updateListKey(client, payload.key, payload.listUpdates || [], payload.ttl, payload.deletedListItems, payload.newListItems)
        break
      case "set":
        if ((!payload.setUpdates || payload.setUpdates.length === 0) &&
            (!payload.deletedSetItems || payload.deletedSetItems.length === 0) &&
            (!payload.newSetItems || payload.newSetItems.length === 0)) {
          throw new Error("Set updates, deletedSetItems, or newSetItems are required for set type")
        }
        await updateSetKey(client, payload.key, payload.setUpdates || [], payload.ttl, payload.deletedSetItems, payload.newSetItems)
        break
      case "zset":
        if (!payload.zsetUpdates || payload.zsetUpdates.length === 0) {
          throw new Error("Zset updates are required for zset type")
        }
        await updateZSetKey(client, payload.key, payload.zsetUpdates, payload.ttl)
        break

      case "json":
        if (!payload.value) {
          throw new Error("Value is required for JSON type")
        }
        await updateJsonKey(client, payload.key, payload.value, payload.ttl)
        break

      default:
        throw new Error(`Unsupported key type for update: ${payload.keyType}`)
    }

    const keyInfo = await getKeyInfo(client, payload.key, undefined, payload.count)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.updateKeyFulfilled,
        payload: {
          connectionId,
          key: keyInfo,
          message: "Key updated successfully",
        },
      }),
    )
  } catch (err) {
    console.error(`Valkey connection error for ${connectionId}:`, err)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.updateKeyFailed,
        payload: {
          connectionId: connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      console.error(`Valkey connection error for ${connectionId}:`, err)
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId,
            errorMessage: "Error updating key - Valkey instance could be down",
            shouldRetry: true,
          },
        }),
      )
    }
  }
}
