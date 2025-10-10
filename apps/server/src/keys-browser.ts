import { WebSocket } from "ws"
import { GlideClient, Batch } from "@valkey/valkey-glide"
import * as R from "ramda"
import { VALKEY } from "../../../common/src/constants.ts"

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
  client: GlideClient,
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

export async function getKeys(
  client: GlideClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    pattern?: string;
    count?: number;
  },
) {
  try {
    const pattern = payload.pattern || "*"
    const count = payload.count || 50
    const batchSize = 10 // TO DO: configurable batch size

    // Using SCAN command with pattern and count
    const rawResponse = (await client.customCommand([
      "SCAN",
      "0",
      "MATCH",
      pattern,
      "COUNT",
      count.toString(),
    ])) as [string, string[]]

    console.log("SCAN response:", rawResponse)

    const [cursor, keys] = rawResponse

    const enrichedKeys = R.flatten(
      await Promise.all(
        R.splitEvery(batchSize, keys).map(async (batch) => {
          const settled = await Promise.allSettled(
            batch.map((k) => getKeyInfo(client, k)),
          )
          return settled.map((res, idx) =>
            res.status === "fulfilled"
              ? res.value
              : { name: batch[idx], type: "unknown", ttl: -1, size: 0 },
          )
        }),
      ),
    )

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeysFulfilled,
        payload: {
          connectionId: payload.connectionId,
          keys: enrichedKeys,
          cursor: cursor || "0",
        },
      }),
    )
  } catch (err) {
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeysFailed,
        payload: {
          connectionId: payload.connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )
    console.log("Error getting keys from Valkey", err)
  }
}

export async function getKeyInfoSingle(
  client: GlideClient,
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
    console.log("Error getting key info from Valkey", err)
  }
}

export async function deleteKey(
  client: GlideClient,
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
    console.log("Error deleting key from Valkey", err)
  }
}

// functions for adding different key types
async function addStringKey(
  client: GlideClient,
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
  client: GlideClient,
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
  client: GlideClient,
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
  client: GlideClient,
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

export async function addKey(
  client: GlideClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    key: string;
    keyType: string;
    value?: string; // for string type
    fields?: { field: string; value: string }[]; // for hash type
    values?: string[]; // for list, set, zset types
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

      // to do: implement other types here
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
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.addKeyFailed,
        payload: {
          connectionId: payload.connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )
    console.log("Error adding key to Valkey", err)
  }
}

// functions for updatin/editing different key types
// Note : the update and add functions are quite similar MAYBE can be refactored later
async function updateStringKey(
  client: GlideClient,
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

async function updateHashKey(
  client: GlideClient,
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
  client: GlideClient,
  key: string,
  updates: { index: number; value: string }[],
  ttl?: number,
) {
  const batch = new Batch(true)

  updates.map(({ index, value }) =>
    batch.customCommand(["LSET", key, index.toString(), value]),
  )

  if (ttl && ttl > 0) {
    batch.customCommand(["EXPIRE", key, ttl.toString()])
  }

  await client.exec(batch, true)
}

async function updateSetKey(
  client: GlideClient,
  key: string,
  updates: { oldValue: string; newValue: string }[],
  ttl?: number,
) {
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

export async function updateKey(
  client: GlideClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    key: string;
    keyType: string;
    value?: string; // for string type
    fields?: { field: string; value: string }[]; // for hash type
    listUpdates?: { index: number; value: string }[]; // for list type
    setUpdates?: { oldValue: string; newValue: string }[]; // for set type
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
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.updateKeyFailed,
        payload: {
          connectionId: payload.connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    )
    console.log("Error updating key in Valkey", err)
  }
}
