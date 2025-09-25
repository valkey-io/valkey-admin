import { WebSocket } from "ws";
import { GlideClient } from "@valkey/valkey-glide";
import { VALKEY } from "../../../common/src/constants.ts";
import * as R from "ramda";

interface EnrichedKeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
}

export async function getKeyInfo(
  client: GlideClient,
  key: string
): Promise<EnrichedKeyInfo> {
  try {
    const [keyType, ttl, memoryUsage] = await Promise.all([
      client.customCommand(["TYPE", key]) as Promise<string>,
      client.customCommand(["TTL", key]) as Promise<number>,
      client.customCommand(["MEMORY", "USAGE", key]) as Promise<number>,
    ]);

    const keyInfo: EnrichedKeyInfo = {
      name: key,
      type: keyType,
      ttl: ttl,
      size: memoryUsage || 0,
    };

    // Get collection size per type
    try {
      const sizeCommands: Record<string, string> = {
        list: "LLEN",
        set: "SCARD",
        zset: "ZCARD",
        hash: "HLEN",
        stream: "XLEN",
      };

      const command = sizeCommands[keyType.toLowerCase()];
      if (command) {
        keyInfo.collectionSize = (await client.customCommand([
          command,
          key,
        ])) as number;
      }
      // string has no collection size
    } catch (err) {
      console.log(`Could not get collection size for key ${key}:`, err);
    }

    return keyInfo;
  } catch (err) {
    return {
      name: key,
      type: "unknown",
      ttl: -1,
      size: 0,
    };
  }
}

export async function getKeys(
  client: GlideClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    pattern?: string;
    count?: number;
  }
) {
  try {
    const pattern = payload.pattern || "*";
    const count = payload.count || 50;
    const batchSize = 10; // TO DO: configurable batch size

    // Using SCAN command with pattern and count
    const rawResponse = (await client.customCommand([
      "SCAN",
      "0",
      "MATCH",
      pattern,
      "COUNT",
      count.toString(),
    ])) as [string, string[]];

    console.log("SCAN response:", rawResponse);

    const [cursor, keys] = rawResponse;

    const enrichedKeys = R.flatten(
      await Promise.all(
        R.splitEvery(batchSize, keys).map(async (batch) => {
          const settled = await Promise.allSettled(
            batch.map((k) => getKeyInfo(client, k))
          );
          return settled.map((res, idx) =>
            res.status === "fulfilled"
              ? res.value
              : { name: batch[idx], type: "unknown", ttl: -1, size: 0 }
          );
        })
      )
    );

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeysFulfilled,
        payload: {
          connectionId: payload.connectionId,
          keys: enrichedKeys,
          cursor: cursor || "0",
        },
      })
    );
  } catch (err) {
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeysFailed,
        payload: {
          connectionId: payload.connectionId,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    );
    console.log("Error getting keys from Valkey", err);
  }
}

export async function getKeyInfoSingle(
  client: GlideClient,
  ws: WebSocket,
  payload: {
    connectionId: string;
    key: string;
  }
) {
  try {
    const keyInfo = await getKeyInfo(client, payload.key);

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeyTypeFulfilled,
        payload: {
          connectionId: payload.connectionId,
          key: payload.key,
          ...keyInfo,
        },
      })
    );
  } catch (err) {
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.getKeyTypeFailed,
        payload: {
          connectionId: payload.connectionId,
          key: payload.key,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    );
    console.log("Error getting key info from Valkey", err);
  }
}

export async function deleteKey(
  client: GlideClient,
  ws: WebSocket,
  payload: { connectionId: string; key: string }
) {
  try {
    // Using UNLINK for non-blocking deletion, DEL is also an option but can block
    const result = (await client.customCommand([
      "UNLINK",
      payload.key,
    ])) as number;

    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.deleteKeyFulfilled,
        payload: {
          connectionId: payload.connectionId,
          key: payload.key,
          deleted: result === 1,
        },
      })
    );
  } catch (err) {
    ws.send(
      JSON.stringify({
        type: VALKEY.KEYS.deleteKeyFailed,
        payload: {
          connectionId: payload.connectionId,
          key: payload.key,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    );
    console.log("Error deleting key from Valkey", err);
  }
}
