import { describe, it, expect, beforeEach } from "vitest"
import { screen, fireEvent, waitFor } from "@testing-library/react"
import { CONNECTED, VALKEY } from "@common/src/constants"
import { buildConnectionId } from "@common/src/connection-id.ts"
import EditForm from "./edit-form"
import { render, setupTestStore } from "@/test/utils/test-utils"

const CONNECTION_ID = buildConnectionId("localhost", "6379", 0)

const buildState = (detailOverrides: Record<string, unknown> = {}) => ({
  [VALKEY.CONNECTION.name]: {
    connections: {
      [CONNECTION_ID]: {
        status: CONNECTED,
        errorMessage: null,
        searchableText: "",
        connectionDetails: {
          host: "localhost",
          port: "6379",
          username: "",
          password: "",
          tls: false,
          verifyTlsCertificate: false,
          alias: "",
          endpointType: "node",
          authType: "password",
          db: 0,
          ...detailOverrides,
        },
      },
    },
  },
})

describe("EditForm", () => {
  let store: ReturnType<typeof setupTestStore>
  let dispatched: { type: string; payload?: Record<string, unknown> }[]

  const renderForm = (detailOverrides: Record<string, unknown> = {}) => {
    store = setupTestStore(buildState(detailOverrides))
    dispatched = []
    const originalDispatch = store.dispatch
    store.dispatch = ((action: { type: string; payload?: Record<string, unknown> }) => {
      dispatched.push(action)
      return originalDispatch(action)
    }) as typeof store.dispatch
    render(<EditForm connectionId={CONNECTION_ID} onClose={() => {}} />, { store })
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it("reconnects under a new connectionId when only the database changes", async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply Changes" }))

    await waitFor(() => {
      expect(dispatched.find((a) => a.type.endsWith("connectPending"))?.payload).toMatchObject({
        connectionId: buildConnectionId("localhost", "6379", 1),
        isEdit: true,
      })
    })

    expect(
      dispatched.find((a) => a.type.endsWith("deleteConnection"))?.payload,
    ).toMatchObject({ connectionId: CONNECTION_ID })
  })

  it("blocks submit and shows a range error when db exceeds the server's databasesCount", async () => {
    renderForm({ databasesCount: 16 })

    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "20" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply Changes" }))

    expect(
      await screen.findByText("This server has databases = 16; choose a database in 0..15."),
    ).toBeInTheDocument()
    expect(dispatched.find((a) => a.type.endsWith("connectPending"))).toBeUndefined()
  })

  it("accepts a db beyond 15 when the server's databasesCount allows it", async () => {
    renderForm({ databasesCount: 32 })

    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "31" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply Changes" }))

    await waitFor(() => {
      expect(dispatched.find((a) => a.type.endsWith("connectPending"))?.payload).toMatchObject({
        connectionId: buildConnectionId("localhost", "6379", 31),
      })
    })
  })

  it("stops applying the learned range once the form points at a different host", async () => {
    // The count was learned from localhost; it says nothing about the new host,
    // so db 20 must reach the backend rather than being blocked locally.
    renderForm({ databasesCount: 16 })

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "other-host" } })
    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "20" } })

    expect(screen.queryByText(/Valid range on this server/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Apply Changes" }))

    await waitFor(() => {
      expect(dispatched.find((a) => a.type.endsWith("connectPending"))?.payload).toMatchObject({
        connectionId: buildConnectionId("other-host", "6379", 20),
      })
    })
    expect(screen.queryByText(/This server has databases =/)).not.toBeInTheDocument()
  })

  it("shows the server's valid range as a hint when databasesCount is known", () => {
    renderForm({ databasesCount: 32 })

    expect(screen.getByText("Valid range on this server: 0..31")).toBeInTheDocument()
  })

  it("shows no range hint when databasesCount is unknown", () => {
    renderForm()

    expect(screen.queryByText(/Valid range on this server/)).not.toBeInTheDocument()
  })
})
