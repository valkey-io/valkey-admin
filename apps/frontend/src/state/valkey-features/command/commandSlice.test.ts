import { describe, it, expect } from "vitest"
import { VALKEY } from "@common/src/constants.ts"
import commandReducer, {
  sendRequested,
  setCommandHistoryLimit,
  type CommandState
} from "./commandSlice"

describe("commandSlice", () => {
  const initialState: CommandState = {
    limit: 10,
    connections: {},
  }

  it("handles sendRequested by setting pending to true", () => {
    const state = commandReducer(
      initialState,
      sendRequested({ command: "PING", connectionId: "conn-1" }),
    )
    expect(state.connections["conn-1"].pending).toBe(true)
  })

  it("handles sendFulfilled with durationMs", () => {
    const action = {
      type: VALKEY.COMMAND.sendFulfilled,
      payload: "PONG",
      meta: {
        command: "PING",
        connectionId: "conn-1",
        durationMs: 1.45,
      },
    }
    // @ts-expect-error Action structure for slice
    const state = commandReducer(initialState, action)
    expect(state.connections["conn-1"].pending).toBe(false)
    expect(state.connections["conn-1"].commands.length).toBe(1)
    const cmd = state.connections["conn-1"].commands[0]
    expect(cmd.command).toBe("PING")
    expect(cmd.response).toBe("PONG")
    expect(cmd.isFulfilled).toBe(true)
    expect(cmd.durationMs).toBe(1.45)
  })

  it("handles sendFailed with durationMs", () => {
    const action = {
      type: VALKEY.COMMAND.sendFailed,
      payload: "ERR unknown command",
      meta: {
        command: "FOO",
        connectionId: "conn-1",
        durationMs: 0.82,
      },
    }
    // @ts-expect-error Action structure for slice
    const state = commandReducer(initialState, action)
    expect(state.connections["conn-1"].pending).toBe(false)
    expect(state.connections["conn-1"].commands.length).toBe(1)
    const cmd = state.connections["conn-1"].commands[0]
    expect(cmd.command).toBe("FOO")
    expect(cmd.error).toBe("ERR unknown command")
    expect(cmd.isFulfilled).toBe(false)
    expect(cmd.durationMs).toBe(0.82)
  })

  it("updates history limit", () => {
    const state = commandReducer(initialState, setCommandHistoryLimit(25))
    expect(state.limit).toBe(25)
  })
})
