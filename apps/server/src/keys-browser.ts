import { WebSocket } from "ws"
import { GlideClient, GlideClusterClient, Batch, ClusterBatch, RouteOption } from "@valkey/valkey-glide"
import pLimit from "p-limit"
import { VALKEY } from "../../../common/src/constants.ts"
import { buildScanCommandArgs } from "./valkey-client-commands.ts"

interface EnrichedKeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any; // this can be array, object, or string depending on the key type.
}

export async function getKeyInfo(
  client: GlideClient | GlideClusterClient,
  key: string,
): Promise<EnrichedKeyInfo> {
  try {
    const [keyType, ttl, memoryUsage] = await Promise.all([
      client.customCommand(["TYPE", key]) as Promise<string>,
      client.customCommand(["TTL", key]) as Promise<number>,
      client.customCommand(["MEMORY", "USAGE", key]) as Promise<number>,
    ])

    const keyInfo: EnrichedKeyInfo = {
      name: key,
      type: keyType,
      ttl: ttl,
      size: memoryUsage || 0,
    }

    // Get collection size and elements for each type
    try {
      const elementCommands: Record<
        string,
        { sizeCmd: string; elementsCmd: string[] }
      > = {
        list: { sizeCmd: "LLEN", elementsCmd: ["LRANGE", key, "0", "-1"] },
        set: { sizeCmd: "SCARD", elementsCmd: ["SMEMBERS", key] },
        zset: {
          sizeCmd: "ZCARD",
          elementsCmd: ["ZRANGE", key, "0", "-1", "WITHSCORES"],
        },
        hash: { sizeCmd: "HLEN", elementsCmd: ["HGETALL", key] },
        stream: { sizeCmd: "XLEN", elementsCmd: ["XRANGE", key, "-", "+"] },
        string: { sizeCmd: "", elementsCmd: ["GET", key] },
        "rejson-rl": { sizeCmd: "", elementsCmd: ["JSON.GET", key] },
      }

      const commands = elementCommands[keyType.toLowerCase()]
      if (commands) {
        const promises = []

        if (commands.sizeCmd) {
          promises.push(client.customCommand([commands.sizeCmd, key]))
        }
        promises.push(client.customCommand(commands.elementsCmd))

        const results = await Promise.all(promises)

        if (commands.sizeCmd) {
          keyInfo.collectionSize = results[0] as number
          keyInfo.elements = results[1]
        } else {
          keyInfo.elements = results[0] // in case of string
        }
      }
    } catch (err) {
      console.log(`Could not get elements for key ${key}:`, err)
    }

    return keyInfo
  } catch (err) {
    console.log("Error getting key", err)
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
        allKeys.add(k)
        if (allKeys.size >= limit) return 
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
        newKeys.forEach((k) => allKeys.add(k))
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
          connectionId: payload.connectionId,
          keys: enrichedKeys,
          totalKeys,
        },
      }),
    )
  } catch (err) {
    console.error(`Valkey connection error for ${payload.connectionId}:`, err)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeysFailed,
        payload: {
          connectionId: payload.connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          connectionId: payload.connectionId,
          errorMessage: "Error getting keys - Valkey instance could be down",
        },
      }),
    )
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
  try {
    const keyInfo = await getKeyInfo(client, payload.key)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeyTypeFulfilled,
        payload: {
          connectionId: payload.connectionId,
          key: payload.key,
          ...keyInfo,
        },
      }),
    )
  } catch (err) {
    console.error(`Valkey connection error for ${payload.connectionId}:`, err)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeyTypeFailed,
        payload: {
          connectionId: payload.connectionId,
          key: payload.key,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          connectionId: payload.connectionId,
          errorMessage: "Error getting key info - Valkey instance could be down",
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
          connectionId: payload.connectionId,
          key: payload.key,
          deleted: result === 1,
        },
      }),
    )
  } catch (err) {
    console.error(`Valkey connection error for ${payload.connectionId}:`, err)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.deleteKeyFailed,
        payload: {
          connectionId: payload.connectionId,
          key: payload.key,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          connectionId: payload.connectionId,
          errorMessage: "Error in deleting key - Valkey instance could be down",
        },
      }),
    )
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
          connectionId: payload.connectionId,
          key: keyInfo,
          message: "Key added successfully",
        },
      }),
    )
  } catch (err) {
    console.error(`Valkey connection error for ${payload.connectionId}:`, err)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.addKeyFailed,
        payload: {
          connectionId: payload.connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          connectionId: payload.connectionId,
          errorMessage: "Error in adding key - Valkey instance could be down",
        },
      }),
    )
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

async function updateListKey(
  client: GlideClient | GlideClusterClient,
  key: string,
  updates: { index: number; value: string }[],
  ttl?: number,
) {

  if (client instanceof GlideClient) {
    const batch = new Batch(true)

    updates.forEach(({ index, value }) =>
      batch.customCommand(["LSET", key, index.toString(), value]),
    )

    if (ttl && ttl > 0) {
      batch.customCommand(["EXPIRE", key, ttl.toString()])
    }

    await client.exec(batch, true)
  } else if (client instanceof GlideClusterClient) {
    const batch = new ClusterBatch(true)

    updates.forEach(({ index, value }) =>
      batch.customCommand(["LSET", key, index.toString(), value]),
    )

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
) {
  if (client instanceof GlideClient) {
    const batch = new Batch(true)

    for (const { oldValue, newValue } of updates) {
      batch.customCommand(["SREM", key, oldValue])
      batch.customCommand(["SADD", key, newValue])
    }

    if (ttl && ttl > 0) {
      batch.customCommand(["EXPIRE", key, ttl.toString()])
    }

    await client.exec(batch, true)
  }
  else if (client instanceof GlideClusterClient) {
    const batch = new ClusterBatch(true)

    for (const { oldValue, newValue } of updates) {
      batch.customCommand(["SREM", key, oldValue])
      batch.customCommand(["SADD", key, newValue])
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
    listUpdates?: { index: number; value: string }[]; // for list type
    setUpdates?: { oldValue: string; newValue: string }[]; // for set type
    zsetUpdates?: { member: string; score: number }[]; // for zset type
    ttl?: number;
  },
) {

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
        if (payload.fields && payload.fields.length > 0) {
          await updateHashKey(client, payload.key, payload.fields, payload.ttl)
          break
        } else {
          throw new Error("Fields are required for hash type")
        }
      case "list":
        if (!payload.listUpdates || payload.listUpdates.length === 0) {
          throw new Error("List updates are required for list type")
        }
        await updateListKey(client, payload.key, payload.listUpdates, payload.ttl)
        break
      case "set":
        if (!payload.setUpdates || payload.setUpdates.length === 0) {
          throw new Error("Set updates are required for set type")
        }
        await updateSetKey(client, payload.key, payload.setUpdates, payload.ttl)
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
          connectionId: payload.connectionId,
          key: keyInfo,
          message: "Key updated successfully",
        },
      }),
    )
  } catch (err) {
    console.error(`Valkey connection error for ${payload.connectionId}:`, err)

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.updateKeyFailed,
        payload: {
          connectionId: payload.connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )

    // valkey connection issue
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          connectionId: payload.connectionId,
          errorMessage: "Error in updating key - Valkey instance could be down",
        },
      }),
    )
  }
}
