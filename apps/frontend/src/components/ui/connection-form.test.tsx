import { describe, it, expect, beforeEach } from "vitest"
import { screen, fireEvent } from "@testing-library/react"
import { VALKEY } from "@common/src/constants"
import { buildConnectionId } from "@common/src/connection-id.ts"
import ConnectionForm from "./connection-form"
import { render, setupTestStore } from "@/test/utils/test-utils"

describe("ConnectionForm", () => {
  let store: ReturnType<typeof setupTestStore>
  let dispatched: { type: string; payload?: Record<string, unknown> }[]

  const renderForm = () => {
    store = setupTestStore({ [VALKEY.CONNECTION.name]: { connections: {} } })
    dispatched = []
    const originalDispatch = store.dispatch
    store.dispatch = ((action: { type: string; payload?: Record<string, unknown> }) => {
      dispatched.push(action)
      return originalDispatch(action)
    }) as typeof store.dispatch
    render(<ConnectionForm onClose={() => {}} />, { store })
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it("accepts a database index beyond 15 and dispatches connectPending with it", async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "localhost" } })
    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "42" } })
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await screen.findByRole("button", { name: /Connect/ })

    const pending = dispatched.find((a) => a.type.endsWith("connectPending"))
    expect(pending?.payload).toMatchObject({
      connectionId: buildConnectionId("localhost", "6379", 42),
    })
  })

  it("allows a valid port and dispatches connectPending", async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "localhost" } })
    fireEvent.change(screen.getByLabelText("Port"), { target: { value: "6380" } })
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await screen.findByRole("button", { name: /Connect/ })

    const pending = dispatched.find((a) => a.type.endsWith("connectPending"))
    expect(pending?.payload).toMatchObject({
      connectionId: buildConnectionId("localhost", "6380", 0),
    })
  })

  it("does not get stuck in Discovery mode when 'cfg' is removed from host", async () => {
    renderForm()

    expect(screen.getByLabelText("Node")).toBeChecked()
    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "7" } })

    const hostInput = screen.getByLabelText("Host")
    fireEvent.change(hostInput, { target: { value: "clustercfg.example.com" } })
    expect(screen.getByLabelText("Discovery")).toBeChecked()

    // Remove 'cfg'
    fireEvent.change(hostInput, { target: { value: "cluster.example.com" } })

    expect(screen.getByLabelText("Node")).toBeChecked()
    expect(screen.getByLabelText("Discovery")).not.toBeChecked()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await screen.findByRole("button", { name: /Connect/ })

    const connectPendingAction = dispatched.find((a) => a.type.endsWith("connectPending"))
    const discoveryPendingAction = dispatched.find((a) => a.type.endsWith("discoveryEndpointPending"))

    expect(discoveryPendingAction).toBeUndefined()
    expect(connectPendingAction).toBeDefined()
    expect(connectPendingAction?.payload).toMatchObject({
      connectionId: buildConnectionId("cluster.example.com", "6379", 7),
      connectionDetails: expect.objectContaining({
        endpointType: "node",
        db: 7,
      }),
    })
  })

  it("preserves explicit Discovery selection when 'cfg' is added and removed from host", () => {
    renderForm()

    // Explicitly click Discovery
    fireEvent.click(screen.getByLabelText("Discovery"))
    expect(screen.getByLabelText("Discovery")).toBeChecked()

    // Type a host containing 'cfg'
    const hostInput = screen.getByLabelText("Host")
    fireEvent.change(hostInput, { target: { value: "clustercfg.example.com" } })
    expect(screen.getByLabelText("Discovery")).toBeChecked()

    // Delete 'cfg'
    fireEvent.change(hostInput, { target: { value: "cluster.example.com" } })
    expect(screen.getByLabelText("Discovery")).toBeChecked()
    expect(screen.getByLabelText("Node")).not.toBeChecked()
  })
})
