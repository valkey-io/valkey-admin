import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { VALKEY } from "valkey-common"
import { sendRequested } from "../actions/command"
import type { Deps } from "../actions/utils"
import type WebSocket from "ws"

describe("Send Command connection-state restrictions", () => {
  for (const Client of [GlideClient, GlideClusterClient]) {
    for (const command of ["SELECT 1", "auth user secret", "\"HELLO\" 3", "'reset'", "QUIT"]) {
      it(`rejects ${command.split(" ")[0]} for ${Client.name} before executing it`, async () => {
        const client = Object.create(Client.prototype) as GlideClient | GlideClusterClient
        let calls = 0
        client.customCommand = async () => { calls++; return "OK" }
        const messages: string[] = []
        const connectionId = "test-connection"
        const deps: Deps = {
          ws: { send: (message: string) => messages.push(message) } as unknown as WebSocket,
          connectionId,
          clients: new Map([[connectionId, { client }]]),
          metricsServerMap: new Map(),
          connectedNodesByCluster: new Map(),
          clusterNodesRegistry: new Map(),
        }
        await sendRequested(deps)({
          type: VALKEY.COMMAND.sendRequested,
          payload: { connectionId, command },
          meta: undefined,
        })
        assert.equal(calls, 0)
        assert.equal(messages.length, 1)
        const reply = JSON.parse(messages[0])
        assert.equal(reply.type, VALKEY.COMMAND.sendFailed)
        assert.match(reply.payload, /^Command blocked:/)
        assert.equal(reply.meta.connectionId, connectionId)
      })
    }
  }
})
