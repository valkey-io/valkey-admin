import {WebSocket} from "ws"
import {GlideClient} from "@valkey/valkey-glide"
import {VALKEY} from "../../../common/src/constants.ts"

interface EnrichedKeyInfo {
  name: string
  type: string
  ttl: number
  size: number
  collectionSize?: number
}

export async function getKeyInfo(client: GlideClient, key: string): Promise<EnrichedKeyInfo> {
  try {
    const [keyType, ttl, memoryUsage] = await Promise.all([
      client.customCommand(["TYPE", key]) as Promise<string>,
      client.customCommand(["TTL", key]) as Promise<number>,
      client.customCommand(["MEMORY", "USAGE", key]) as Promise<number>
    ])

    const keyInfo: EnrichedKeyInfo = {
      name: key,
      type: keyType,
      ttl: ttl,
      size: memoryUsage || 0
    }

    // Get collection size per type
    try {
      switch (keyType?.toLowerCase()) {
        case 'list':
          keyInfo.collectionSize = await client.customCommand(["LLEN", key]) as number
          break
        case 'set':
          keyInfo.collectionSize = await client.customCommand(["SCARD", key]) as number
          break
        case 'zset':
          keyInfo.collectionSize = await client.customCommand(["ZCARD", key]) as number
          break
        case 'hash':
          keyInfo.collectionSize = await client.customCommand(["HLEN", key]) as number
          break
        case 'stream':
          keyInfo.collectionSize = await client.customCommand(["XLEN", key]) as number
          break
        default:
          // string has no collection size
          break
      }
    } catch (err) {
      console.log(`Could not get collection size for key ${key}:`, err)
    }

    return keyInfo
  } catch (err) {
    return {
      name: key,
      type: 'unknown',
      ttl: -1,
      size: 0
    }
  }
}

export async function getKeys(client: GlideClient, ws: WebSocket, payload: { 
    connectionId: string
    pattern?: string
    count?: number 
  }) {
    try {
      const pattern = payload.pattern || "*"
      const count = payload.count || 50
      
      // Using SCAN command with pattern and count
      const rawResponse = await client.customCommand([
        "SCAN", 
        "0", 
        "MATCH", 
        pattern, 
        "COUNT", 
        count.toString()
      ]) as [string, string[]]
      
      console.log("SCAN response:", rawResponse)
      
      const [cursor, keys] = rawResponse
      
      const enrichedKeys: EnrichedKeyInfo[] = []
      
      if (keys && keys.length > 0) {
        // Processing in batches to avoid overloading the server
        const batchSize = 10
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize)
          const batchPromises = batch.map(key => getKeyInfo(client, key))
          const batchResults = await Promise.allSettled(batchPromises)
          
          batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              enrichedKeys.push(result.value)
            } else {
              enrichedKeys.push({
                name: batch[index],
                type: 'unknown',
                ttl: -1,
                size: 0
              })
            }
          })
        }
      }
      
      ws.send(JSON.stringify({
        type: VALKEY.KEYS.getKeysFulfilled,
        payload: {
          connectionId: payload.connectionId,
          keys: enrichedKeys,
          cursor: cursor || "0"
        }
      }))
    } catch (err) {
      ws.send(JSON.stringify({
        type: VALKEY.KEYS.getKeysFailed,
        payload: {
          connectionId: payload.connectionId,
          error: err instanceof Error ? err.message : String(err)
        }
      }))
      console.log("Error getting keys from Valkey", err)
    }
  }

export async function getKeyInfoSingle(client: GlideClient, ws: WebSocket, payload: {
  connectionId: string
  key: string
}) {
  try {
    const keyInfo = await getKeyInfo(client, payload.key)
    
    ws.send(JSON.stringify({
      type: VALKEY.KEYS.getKeyTypeFulfilled,
      payload: {
        connectionId: payload.connectionId,
        key: payload.key,
        ...keyInfo
      }
    }))
  } catch (err) {
    ws.send(JSON.stringify({
      type: VALKEY.KEYS.getKeyTypeFailed,
      payload: {
        connectionId: payload.connectionId,
        key: payload.key,
        error: err instanceof Error ? err.message : String(err)
      }
    }))
    console.log("Error getting key info from Valkey", err)
  }
}