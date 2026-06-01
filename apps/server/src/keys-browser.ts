import { WebSocket } from "ws"
import { 
  GlideClient, 
  GlideClusterClient, 
  Batch, ClusterBatch, 
  RouteOption, 
  ConnectionError, 
  TimeoutError, 
  ClosingError, 
  GlideReturnType
} from "@valkey/valkey-glide"
import pLimit from "p-limit"
import { VALKEY, VALKEY_CLIENT } from "valkey-common"
import { formatBytes } from "valkey-common"
import { buildScanCommandArgs } from "./valkey-client-commands"

interface EnrichedKeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any; // this can be array, object, or string depending on the key type.
  elementsWarning?: string; // alternative for elements when they cannot be displayed.
}

async function getScanKeyInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  commands: { sizeCmd: string; elementsCmd: string[] },
): Promise<EnrichedKeyInfo> {
  try {
    const results = new Set<string | { key: string; value: string }>()
    const isHash = keyInfo.type.toLowerCase() === "hash"
    let cursor = "0"
    
    // This Promise.all 1) gets the Key's collection size, and 2) fills the result set with the collection's values.
    // The side-effect promise is used result set is filled with a SCAN style command (requiring repeated queries with the cursor).
    const [collectionSize] = await Promise.all([
      client.customCommand([commands.sizeCmd, keyInfo.name]),
      (async () => {
        do {
          const [newCursor, elements] = await client.customCommand([...commands.elementsCmd, cursor]) as [string, GlideReturnType[]]

          if (isHash) {
            // Hash key types require constructing an object from a flat array.
            // i.e. converting [key1, value1...] to [{key: key1, value}]
            for (let i = 0; i < elements.length; i += 2){
              results.add({ 
                key: elements[i] as string, 
                value: elements[i + 1] as string,
              })
            }
          } else {
            elements.forEach((element) => results.add(element as string))
          }
          cursor = newCursor
        } while (cursor !== "0")
      })(),
    ])

    return {
      ...keyInfo,
      collectionSize: collectionSize as number,
      elements: Array.from(results),
    }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return {
      ...keyInfo,
      elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE,
    }
  }
}

async function getPaginatedListInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  commands: { sizeCmd: string },
): Promise<EnrichedKeyInfo> {
  try {
    const [firstPage, collectionSize] = await Promise.all([
      client.customCommand(["LRANGE", keyInfo.name, "0", (VALKEY_CLIENT.ELEMENT_PAGE_SIZE - 1).toString()]),
      client.customCommand([commands.sizeCmd, keyInfo.name]),
    ]) as [string[], number]

    const results: string[] = [...firstPage]
    let offset = results.length

    while (offset < collectionSize) {
      const elements = await client.customCommand([
        "LRANGE", keyInfo.name, offset.toString(), (offset + VALKEY_CLIENT.ELEMENT_PAGE_SIZE - 1).toString(),
      ]) as string[]
      if (!elements || elements.length === 0) break
      results.push(...elements)
      offset += elements.length
    }

    return { ...keyInfo, collectionSize, elements: results }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return { ...keyInfo, elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE }
  }
}

async function getPaginatedStreamInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  commands: { sizeCmd: string },
): Promise<EnrichedKeyInfo> {
  try {
    const [firstPage, collectionSize] = await Promise.all([
      client.customCommand(["XRANGE", keyInfo.name, "-", "+", "COUNT", VALKEY_CLIENT.ELEMENT_PAGE_SIZE.toString()]),
      client.customCommand([commands.sizeCmd, keyInfo.name]),
    ]) as [GlideReturnType[][], number]

    const results: GlideReturnType[][] = [...firstPage]

    if (firstPage.length === VALKEY_CLIENT.ELEMENT_PAGE_SIZE) {
      const lastId = firstPage[firstPage.length - 1][0] as string
      let cursor = `(${lastId}`

      while (true) {
        const entries = await client.customCommand([
          "XRANGE", keyInfo.name, cursor, "+", "COUNT", VALKEY_CLIENT.ELEMENT_PAGE_SIZE.toString(),
        ]) as GlideReturnType[][]
        if (!entries || entries.length === 0) break
        results.push(...entries)
        if (entries.length < VALKEY_CLIENT.ELEMENT_PAGE_SIZE) break
        cursor = `(${entries[entries.length - 1][0] as string}`
      }
    }

    return { ...keyInfo, collectionSize, elements: results }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return { ...keyInfo, elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE }
  }
}

type ZSetMember = { key: string; value: string | number }

async function getPaginatedZSetInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  commands: { sizeCmd: string },
): Promise<EnrichedKeyInfo> {
  // Builds one "page" query: members from `min` score upward, capped at PAGE_SIZE
  const range = (min: string): string[] => [
    "ZRANGE", keyInfo.name, min, "+inf", "BYSCORE", "LIMIT", "0", VALKEY_CLIENT.ELEMENT_PAGE_SIZE.toString(), "WITHSCORES",
  ]

  try {
    // Grab the first page and the total member count at the same time.
    const [firstPage, collectionSize] = await Promise.all([
      client.customCommand(range("-inf")),
      client.customCommand([commands.sizeCmd, keyInfo.name]),
    ]) as [ZSetMember[], number]

    const seen = new Set<string>() // member names we've already kept
    const results: ZSetMember[] = []
    // Adds only members we haven't seen yet; returns how many were new.
    const addMembers = (page: ZSetMember[]): number => {
      let added = 0
      for (const member of page) {
        if (!seen.has(member.key)) {
          seen.add(member.key)
          results.push(member)
          added++
        }
      }
      return added
    }

    addMembers(firstPage)
    let lastPage = firstPage

    // Keep paging until we have every member, or a page comes back not full (the end).
    while (results.length < collectionSize && lastPage.length === VALKEY_CLIENT.ELEMENT_PAGE_SIZE) {
      // Next page starts at the last score we saw. Including that score (not skipping it)
      // means members tied on that score aren't lost — `seen` removes the repeats
      const lastScore = String(lastPage[lastPage.length - 1].value)
      const page = await client.customCommand(range(lastScore)) as ZSetMember[]
      if (!page || page.length === 0) break

      if (addMembers(page) === 0) {
        // Page had no new members, so skip past this score
        const next = await client.customCommand(range(`(${lastScore}`)) as ZSetMember[]
        if (!next || next.length === 0) break
        addMembers(next)
        lastPage = next
      } else {
        lastPage = page
      }
    }

    return { ...keyInfo, collectionSize, elements: results }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return { ...keyInfo, elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE }
  }
}

// JSON queries give back the value inside an array, like [value]. This returns just the value
function unwrapJsonPathResult<T>(result: unknown): T {
  return (Array.isArray(result) ? result[0] : result) as T
}

async function getPaginatedJsonInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
): Promise<EnrichedKeyInfo> {
  try {
    // Check the shape first, then read it the cheapest way
    const rootType = unwrapJsonPathResult<string>(
      await client.customCommand(["JSON.TYPE", keyInfo.name, "$"]),
    )

    // if array read it in slices, a page at a time
    if (rootType === "array") {
      const length = unwrapJsonPathResult<number>(
        await client.customCommand(["JSON.ARRLEN", keyInfo.name, "$"]),
      )
      const elements: unknown[] = []
      for (let start = 0; start < length; start += VALKEY_CLIENT.ELEMENT_PAGE_SIZE) {
        const slice = await client.customCommand([
          "JSON.GET", keyInfo.name, `$[${start}:${start + VALKEY_CLIENT.ELEMENT_PAGE_SIZE}]`,
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
      const keys = unwrapJsonPathResult<string[]>(
        await client.customCommand(["JSON.OBJKEYS", keyInfo.name, "$"]),
      )
      const obj: Record<string, unknown> = {}
      for (const field of keys) {
        // quote the field name so any characters in it are safe
        const value = await client.customCommand([
          "JSON.GET", keyInfo.name, `$[${JSON.stringify(field)}]`,
        ]) as string
        obj[field] = unwrapJsonPathResult(JSON.parse(value))
      }
      return { ...keyInfo, collectionSize: keys.length, elements: JSON.stringify(obj) }
    }

    // anything else (string, number, etc.) we just read it in one go
    const value = await client.customCommand(["JSON.GET", keyInfo.name]) as string
    return { ...keyInfo, elements: value }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    return { ...keyInfo, elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE }
  }
}

async function getFullKeyInfo(
  client: GlideClient | GlideClusterClient,
  keyInfo: EnrichedKeyInfo,
  commands: { sizeCmd: string; elementsCmd: string[] },
): Promise<EnrichedKeyInfo>{
  try {
    const promises = [client.customCommand(commands.elementsCmd)]

    if (commands.sizeCmd) {
      promises.push(client.customCommand([commands.sizeCmd, keyInfo.name]))
    }

    const results = await Promise.all(promises)

    if (commands.sizeCmd) {
      return {
        ...keyInfo,
        collectionSize: results[1] as number,
        elements: results[0],
      }
    } else {
      // in case of string with no collectionSize
      return {
        ...keyInfo,
        elements: results[0],
      }
    }
  } catch (err) {
    console.log(`Could not get elements for key ${keyInfo.name}:`, err)
    // Valkey client uses String decoder, which throws this error when it encounters non-UTF-8 bytes
    if (err instanceof Error && err.message.includes("Decoding error")) {
      return { ...keyInfo, elementsWarning: VALKEY_CLIENT.MESSAGES.NOT_READABLE }
    }
    return keyInfo
  }
}

export async function getKeyInfo(
  client: GlideClient | GlideClusterClient,
  key: string,
): Promise<EnrichedKeyInfo> {
  try {
    const [keyType, ttl, memoryUsage] = await Promise.all([
      client.customCommand(["TYPE", key]) as Promise<string>,
      client.customCommand(["TTL", key]).catch(() => -1) as Promise<number>,
      client.customCommand(["MEMORY", "USAGE", key]).catch(() => null) as Promise<number | null>,
    ])

    const keyInfo: EnrichedKeyInfo = {
      name: key,
      type: keyType,
      ttl: ttl,
      size: memoryUsage || 0,
    }

    // Get collection size and elements for each type
    const elementCommands: Record<
      string,
      { sizeCmd: string; elementsCmd?: string[] }
    > = {
      // Paginated readers build their own commands, so they only need sizeCmd
      list: { sizeCmd: "LLEN" },
      zset: { sizeCmd: "ZCARD" },
      stream: { sizeCmd: "XLEN" },
      "rejson-rl": { sizeCmd: "" },
      
      string: { sizeCmd: "", elementsCmd: ["GET", key] },
      // Scan
      set: { sizeCmd: "SCARD", elementsCmd: ["SSCAN", keyInfo.name] },
      hash: { sizeCmd: "HLEN", elementsCmd: ["HSCAN", keyInfo.name] },
    }

    const commands = elementCommands[keyType.toLowerCase()]
    if (!commands) {
      console.log(`Could not get commands for key type ${keyType.toLowerCase()}`)
      return keyInfo
    }

    if (memoryUsage > VALKEY_CLIENT.KEY_VALUE_SIZE_LIMIT) {
      if (commands.sizeCmd){
        keyInfo.collectionSize = await (client.customCommand([commands.sizeCmd, key])) as number
      }
      keyInfo.elementsWarning = `This key is ${formatBytes(memoryUsage)}, which is larger than the maximum display size of ${formatBytes(VALKEY_CLIENT.KEY_VALUE_SIZE_LIMIT)}.`

      return keyInfo
    }

    switch (keyType.toLowerCase()) {
      case "set":
      case "hash":
        if (!commands.elementsCmd) return keyInfo
        return await getScanKeyInfo(client, keyInfo, { ...commands, elementsCmd: commands.elementsCmd })
      case "list":
        return await getPaginatedListInfo(client, keyInfo, commands)
      case "stream":
        return await getPaginatedStreamInfo(client, keyInfo, commands)
      case "zset":
        return await getPaginatedZSetInfo(client, keyInfo, commands)
      case "rejson-rl":
        return await getPaginatedJsonInfo(client, keyInfo)
      default:
        if (!commands.elementsCmd) return keyInfo
        return await getFullKeyInfo(client, keyInfo, { ...commands, elementsCmd: commands.elementsCmd })
    }

  } catch (err) {
    console.error("Error getting key", err)
    return {
      name: key,
      type: "unknown",
      ttl: -1,
      size: 0,
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
    const enrichedKeys = await Promise.all(
      [...allKeys].map((k) =>
        limit(() =>
          getKeyInfo(client, k).catch(() => ({
            name: k,
            type: "unknown",
            ttl: -1,
            size: 0,
          })),
        ),
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
  if (ttl && ttl > 0) {
    await client.customCommand(["SETEX", key, ttl.toString(), value])
  } else {
    await client.customCommand(["SET", key, value])
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
  await client.customCommand(["JSON.SET", key, "$", value])

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
async function updateStringKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  value: string,
  ttl?: number,
) {
  if (ttl && ttl > 0) {
    await client.customCommand(["SETEX", key, ttl.toString(), value])
  } else {
    await client.customCommand(["SET", key, value])
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

async function updateHashKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  fields: { field: string; value: string }[],
  ttl?: number,
  deletedHashFields?: string[],
) {
  console.debug("delete hash fields:::", deletedHashFields)
  console.debug("update hash fields:::", fields)
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

async function updateListKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  updates: { index: number; value: string }[],
  ttl?: number,
  deletedListItems?: { index: number; value: string }[],
  newListItems?: string[],
) {

  if (client instanceof GlideClient) {
    const batch = new Batch(true)

    // first delete items (sorted by index descending to avoid index shifting issues)
    if (deletedListItems && deletedListItems.length > 0) {
      const sortedDeletes = [...deletedListItems].sort((a, b) => b.index - a.index)
      sortedDeletes.forEach(({ value }) => {
        batch.customCommand(["LREM", key, "1", value])
      })
    }

    // then update items
    if (updates && updates.length > 0) {
      updates.forEach(({ index, value }) =>
        batch.customCommand(["LSET", key, index.toString(), value]),
      )
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

    if (deletedListItems && deletedListItems.length > 0) {
      const sortedDeletes = [...deletedListItems].sort((a, b) => b.index - a.index)
      sortedDeletes.forEach(({ value }) => {
        batch.customCommand(["LREM", key, "1", value])
      })
    }

    if (updates && updates.length > 0) {
      updates.forEach(({ index, value }) =>
        batch.customCommand(["LSET", key, index.toString(), value]),
      )
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

    const keyInfo = await getKeyInfo(client, payload.key)

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
