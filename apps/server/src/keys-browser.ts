import {WebSocket} from "ws"
import {GlideClient} from "@valkey/valkey-glide"
import {VALKEY} from "../../../common/src/constants.ts"

export async function getKeys(client: GlideClient, ws: WebSocket, payload: { 
    connectionId: string
    pattern?: string
    count?: number 
  }) {
    try {
      const pattern = payload.pattern || "*"
      const count = payload.count || 50
      
      // Here Using SCAN command with pattern and count
      const rawResponse = await client.customCommand([
        "SCAN", 
        "0", 
        "MATCH", 
        pattern, 
        "COUNT", 
        count.toString()
      ]) as [string, string[]]
      
      console.log("SCAN response:", rawResponse)
      
      // SCAN Results [cursor, [keys...]]
      const [cursor, keys] = rawResponse
      
      ws.send(JSON.stringify({
        type: VALKEY.KEYS.getKeysFulfilled,
        payload: {
          connectionId: payload.connectionId,
          keys: keys || [],
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