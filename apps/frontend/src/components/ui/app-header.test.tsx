import { describe, it, expect, beforeEach, vi } from "vitest"
import { screen, fireEvent } from "@testing-library/react"
import { CONNECTED, VALKEY } from "@common/src/constants"
import { buildConnectionId } from "@common/src/connection-id.ts"
import { AppHeader } from "./app-header"
import { render, setupTestStore } from "@/test/utils/test-utils"

const CONNECTION_ID = buildConnectionId("localhost", "6379", 0)

const mockNavigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: CONNECTION_ID }),
    useLocation: () => ({ pathname: `/${CONNECTION_ID}/key-browser` }),
  }
})

const buildState = (databasesCount = 16) => ({
  [VALKEY.CONNECTION.name]: {
    connections: {
      [CONNECTION_ID]: {
        status: CONNECTED,
        errorMessage: null,
        searchableText: "",
        connectionDetails: {
          host: "localhost",
          port: "6379",
          username: "default",
          password: "",
          tls: false,
          verifyTlsCertificate: false,
          alias: "",
          endpointType: "node",
          authType: "password",
          db: 0,
          databasesCount,
        },
      },
    },
  },
})

describe("AppHeader Database Switcher", () => {
  let store: ReturnType<typeof setupTestStore>
  let dispatched: { type: string; payload?: Record<string, unknown> }[]

  const renderHeader = (databasesCount = 16) => {
    store = setupTestStore(buildState(databasesCount))
    dispatched = []
    const originalDispatch = store.dispatch
    store.dispatch = ((action: { type: string; payload?: Record<string, unknown> }) => {
      dispatched.push(action)
      return originalDispatch(action)
    }) as typeof store.dispatch
    render(<AppHeader icon={null} title="Key Browser" />, { store })
  }

  beforeEach(() => {
    mockNavigate.mockReset()
  })

  it("renders database dropdown populated with databasesCount", () => {
    renderHeader(4)
    const select = screen.getByLabelText("Switch Database") as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(select.value).toBe("0")
    expect(select.options.length).toBe(4)
  })

  it("switches database, dispatches connectPending, and navigates", () => {
    renderHeader(16)
    const select = screen.getByLabelText("Switch Database")
    fireEvent.change(select, { target: { value: "2" } })

    const targetConnectionId = buildConnectionId("localhost", "6379", 2)
    expect(dispatched.find((a) => a.type.endsWith("connectPending"))?.payload).toMatchObject({
      connectionId: targetConnectionId,
      connectionDetails: {
        host: "localhost",
        port: "6379",
        db: 2,
      },
    })
    expect(mockNavigate).toHaveBeenCalledWith(`/${targetConnectionId}/key-browser`)
  })
})
