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

  // The server checks the id against the normalized host and port, so the
  // form must build it the same way: trimmed, lowercased, no trailing dot.
  it("normalizes the host before it builds the id and sends the details", async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: " Cache.Internal. " } })
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await screen.findByRole("button", { name: /Connect/ })

    const pending = dispatched.find((a) => a.type.endsWith("connectPending"))
    expect(pending?.payload).toMatchObject({
      connectionId: "cache-internal-6379-db0",
      connectionDetails: { host: "cache.internal", port: "6379" },
    })
  })

  it("shows the endpoint error and does not dispatch for a non-canonical port", async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "localhost" } })
    fireEvent.change(screen.getByLabelText("Port"), { target: { value: "06379" } })
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await screen.findByText(/port between 1 and 65535/i)
    expect(dispatched.find((a) => a.type.endsWith("connectPending"))).toBeUndefined()
  })

  it("does not force-switch endpoint type to Discovery when host contains 'cfg'", async () => {
    const hint = "If this is a cluster configuration endpoint, switch Endpoint Type to Discovery."
    renderForm()

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "clustercfg.example.com" } })
    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "7" } })
    expect(screen.getByText(hint)).toBeInTheDocument()
    expect(screen.getByLabelText("Node")).toBeChecked()

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "cluster.example.com" } })
    expect(screen.queryByText(hint)).not.toBeInTheDocument()
    expect(screen.getByLabelText("Node")).toBeChecked()
    expect(screen.getByLabelText("Database")).toHaveValue(7)

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "clustercfg.example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await screen.findByRole("button", { name: /Connect/ })

    const pending = dispatched.find((a) => a.type.endsWith("connectPending"))
    expect(pending?.payload).toMatchObject({
      connectionId: buildConnectionId("clustercfg.example.com", "6379", 7),
      connectionDetails: expect.objectContaining({ endpointType: "node", db: 7 }),
    })
  })
})
