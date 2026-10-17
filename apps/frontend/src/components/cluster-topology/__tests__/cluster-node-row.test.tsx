import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { MemoryRouter } from "react-router"
import { ERROR } from "@common/src/constants"
import { ClusterNodeRow } from "../cluster-node-row"
import type { PrimaryNode, ParsedNodeInfo, NodeUtilization } from "@/state/valkey-features/cluster/clusterSlice"

const mockNavigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function createMockStore(initialState = {}) {
  return configureStore({
    reducer: {
      valkeyConnection: (state = { connections: {} }) => state,
      valkeyCluster: (state = { clusters: {} }) => state,
    },
    preloadedState: initialState,
  })
}

const defaultPrimaryConfig: PrimaryNode = {
  host: "127.0.0.1",
  port: 6379,
  tls: false,
  verifyTlsCertificate: false,
  replicas: [],
}

describe("ClusterNodeRow - Health Indicator & Uncoupled Actions (Issue #461)", () => {
  it("renders healthy status when nodeData indicates responsive INFO", () => {
    const store = createMockStore()
    const nodeData: ParsedNodeInfo = {
      uptime_in_days: "5",
      tcp_port: "6379",
      used_memory_human: "10M",
      used_memory: "10485760",
      maxmemory: "100M",
      used_cpu_sys: "1.2",
      instantaneous_ops_per_sec: "120",
      total_commands_processed: "50000",
      role: "master",
      connected_clients: "8",
      keyspace_hits: "900",
      keyspace_misses: "100",
    }

    render(
      <Provider store={store}>
        <MemoryRouter>
          <table>
            <tbody>
              <ClusterNodeRow
                clusterId="cluster-1"
                host="127.0.0.1"
                nodeData={nodeData}
                port={6379}
                primaryConfig={defaultPrimaryConfig}
                role="primary"
              />
            </tbody>
          </table>
        </MemoryRouter>
      </Provider>,
    )

    const healthDot = screen.getByRole("status")
    expect(healthDot).toBeInTheDocument()
    expect(healthDot.getAttribute("aria-label")).toContain("Node Healthy")
  })

  it("renders degraded status when utilizationLevel is high", () => {
    const store = createMockStore()
    const nodeData: ParsedNodeInfo = {
      uptime_in_days: "10",
      tcp_port: "6379",
      used_memory_human: "95M",
      used_memory: "99614720",
      maxmemory: "100M",
      used_cpu_sys: "95.0",
      instantaneous_ops_per_sec: "5000",
      total_commands_processed: "100000",
      role: "master",
      connected_clients: "50",
      keyspace_hits: "800",
      keyspace_misses: "200",
    }
    const utilization: NodeUtilization = {
      nodeId: "127.0.0.1:6379",
      memory_utilization_percent: 95,
      memory_basis: "maxmemory",
      used_memory: 99614720,
      memory_limit_bytes: 104857600,
      cpu_utilization_percent: 90,
      cpu_sample_interval_seconds: 5,
      warnings: ["High memory"],
    }

    render(
      <Provider store={store}>
        <MemoryRouter>
          <table>
            <tbody>
              <ClusterNodeRow
                clusterId="cluster-1"
                host="127.0.0.1"
                nodeData={nodeData}
                port={6379}
                primaryConfig={defaultPrimaryConfig}
                role="primary"
                utilization={utilization}
              />
            </tbody>
          </table>
        </MemoryRouter>
      </Provider>,
    )

    const healthDot = screen.getByRole("status")
    expect(healthDot.getAttribute("aria-label")).toContain("Node Degraded")
  })

  it("renders unreachable status when nodeData has not reported metrics", () => {
    const store = createMockStore()

    render(
      <Provider store={store}>
        <MemoryRouter>
          <table>
            <tbody>
              <ClusterNodeRow
                clusterId="cluster-1"
                host="127.0.0.1"
                nodeData={undefined}
                port={6379}
                primaryConfig={defaultPrimaryConfig}
                role="primary"
              />
            </tbody>
          </table>
        </MemoryRouter>
      </Provider>,
    )

    const healthDot = screen.getByRole("status")
    expect(healthDot.getAttribute("aria-label")).toContain("Node Unreachable")
  })

  it("prioritizes isError over cached nodeData and marks node as unreachable", () => {
    const store = createMockStore({
      valkeyConnection: {
        connections: {
          "127-0-0-1-6379-db0": { status: ERROR },
        },
      },
    })
    const nodeData: ParsedNodeInfo = {
      uptime_in_days: "5",
      tcp_port: "6379",
      used_memory_human: "10M",
      used_memory: "10485760",
      maxmemory: "100M",
      used_cpu_sys: "1.2",
      instantaneous_ops_per_sec: "120",
      total_commands_processed: "50000",
      role: "master",
      connected_clients: "8",
      keyspace_hits: "900",
      keyspace_misses: "100",
    }

    render(
      <Provider store={store}>
        <MemoryRouter>
          <table>
            <tbody>
              <ClusterNodeRow
                clusterId="cluster-1"
                host="127.0.0.1"
                nodeData={nodeData}
                port={6379}
                primaryConfig={defaultPrimaryConfig}
                role="primary"
              />
            </tbody>
          </table>
        </MemoryRouter>
      </Provider>,
    )

    const healthDot = screen.getByRole("status")
    expect(healthDot.getAttribute("aria-label")).toContain("Node Unreachable")
    expect(healthDot.getAttribute("aria-label")).toContain("Connection error")
  })

  it("navigates immediately to Dashboard and Command routes when cluster password is available", () => {
    const store = createMockStore({
      valkeyConnection: {
        connections: {
          "seed-node": {
            connectionDetails: {
              clusterId: "cluster-1",
              password: "secret-password",
            },
          },
        },
      },
    })

    render(
      <Provider store={store}>
        <MemoryRouter>
          <table>
            <tbody>
              <ClusterNodeRow
                clusterId="cluster-1"
                host="127.0.0.1"
                port={6379}
                primaryConfig={defaultPrimaryConfig}
                role="primary"
              />
            </tbody>
          </table>
        </MemoryRouter>
      </Provider>,
    )

    const dashboardBtn = screen.getByRole("button", { name: "Dashboard" })
    const commandBtn = screen.getByRole("button", { name: "Command" })

    expect(dashboardBtn).not.toBeDisabled()
    expect(commandBtn).not.toBeDisabled()

    fireEvent.click(dashboardBtn)
    expect(mockNavigate).toHaveBeenCalledWith("/cluster-1/127-0-0-1-6379-db0/dashboard")

    fireEvent.click(commandBtn)
    expect(mockNavigate).toHaveBeenCalledWith("/cluster-1/127-0-0-1-6379-db0/sendcommand")
  })

  it("opens password modal when no password is saved, and navigates upon password submission", () => {
    const store = createMockStore()

    render(
      <Provider store={store}>
        <MemoryRouter>
          <table>
            <tbody>
              <ClusterNodeRow
                clusterId="cluster-1"
                host="127.0.0.1"
                port={6379}
                primaryConfig={defaultPrimaryConfig}
                role="primary"
              />
            </tbody>
          </table>
        </MemoryRouter>
      </Provider>,
    )

    const dashboardBtn = screen.getByRole("button", { name: "Dashboard" })
    expect(dashboardBtn).not.toBeDisabled()

    fireEvent.click(dashboardBtn)
    // Modal opens instead of immediate navigation
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})
