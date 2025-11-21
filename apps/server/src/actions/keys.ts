import { addKey, deleteKey, getKeyInfoSingle, getKeys, updateKey } from "../keys-browser.ts"
import { VALKEY } from "../../../../common/src/constants.ts"
import { type Deps, withDeps } from "./utils.ts"

type GetKeysPayload = {
  connectionId: string;
  pattern?: string | undefined;
  count?: number | undefined;
}

export const getKeysRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const client = clients.get(connectionId)

    if (client) {
      await getKeys(client, ws, action.payload as GetKeysPayload)
    } else {
      ws.send(
        JSON.stringify({
          type: VALKEY.KEYS.getKeysFailed,
          payload: {
            connectionId,
            error: "Invalid connection Id",
          },
        }),
      )
    }
  },
)

interface KeyPayload {
  connectionId: string;
  key: string;
}

export const getKeyTypeRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const { key } = action.payload as unknown as KeyPayload

    console.log("Handling getKeyTypeRequested for key:", key)
    const client = clients.get(connectionId)

    if (client) {
      await getKeyInfoSingle(client, ws, action.payload as unknown as KeyPayload)
    } else {
      console.log("No client found for connectionId:", connectionId)
      ws.send(
        JSON.stringify({
          type: VALKEY.KEYS.getKeyTypeFailed,
          payload: {
            connectionId,
            key,
            error: "Invalid connection Id",
          },
        }),
      )
    }
  },
)

export const deleteKeyRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const { key } = action.payload as unknown as KeyPayload

    console.log("Handling deleteKeyRequested for key:", key)
    const client = clients.get(connectionId)

    if (client) {
      await deleteKey(client, ws, action.payload as unknown as KeyPayload)
    } else {
      console.log("No client found for connectionId:", connectionId)
      ws.send(
        JSON.stringify({
          type: VALKEY.KEYS.deleteKeyFailed,
          payload: {
            connectionId,
            key,
            error: "Invalid connection Id",
          },
        }),
      )
    }
  },
)

interface AddKeyRequestedPayload extends KeyPayload {
  keyType: string;
  value?: string | undefined;
  fields?: {
    field: string;
    value: string;
  }[] | undefined;
  values?: string[] | undefined;
  ttl?: number | undefined;
}

export const addKeyRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const { key } = action.payload as unknown as KeyPayload

    console.log("Handling addKeyRequested for key:", key)
    const client = clients.get(connectionId)
    if (client) {
      await addKey(client, ws, action.payload as unknown as AddKeyRequestedPayload)
    } else {
      console.log("No client found for connectionId:", connectionId)
      ws.send(
        JSON.stringify({
          type: VALKEY.KEYS.addKeyFailed,
          payload: {
            connectionId,
            key,
            error: "Invalid connection Id",
          },
        }),
      )
    }
  },
)

export const updateKeyRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const { key } = action.payload as unknown as KeyPayload

    console.log("Handling updateKeyRequested for key:", key)
    const client = clients.get(connectionId)
    if (client) {
      await updateKey(client, ws, action.payload as unknown as AddKeyRequestedPayload)
    } else {
      console.log("No client found for connectionId:", connectionId)
      ws.send(
        JSON.stringify({
          type: VALKEY.KEYS.addKeyFailed,
          payload: {
            connectionId,
            key,
            error: "Invalid connection Id",
          },
        }),
      )
    }
  },
)
