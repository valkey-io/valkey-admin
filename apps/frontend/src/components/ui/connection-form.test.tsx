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

  it("does not force-switch endpoint type to Discovery when host contains 'cfg'", async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "clustercfg.example.com" } })
    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "7" } })
    expect(screen.getByText("Hint: If this is a cluster configuration endpoint, switch Endpoint Type to Discovery.")).toBeInTheDocument()
    expect(screen.getByLabelText("Node")).toBeChecked()

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "cluster.example.com" } })
    expect(screen.queryByText("Hint: If this is a cluster configuration endpoint, switch Endpoint Type to Discovery.")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Node")).toBeChecked()
    expect(screen.getByLabelText("Database")).toHaveValue(7)

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "clustercfg.example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await screen.findByRole("button", { name: /Connect/ })

    const pending = dispatched.find((a) => a.type.endsWith("connectPending"))
    expect(pending?.payload).toMatchObject({
      connectionId: buildConnectionId("clustercfg.example.com", "6379", 7),
      connectionDetails: expect.objectContaining({
        endpointType: "node",
        db: 7,
      }),
    })
  })
})
