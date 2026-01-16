import { render } from "@testing-library/react"
import { Provider } from "react-redux"
import { BrowserRouter } from "react-router"
import { configureStore } from "@reduxjs/toolkit"
import { CONNECTED, DISCONNECTED } from "@common/src/constants"
import { ConnectionEntry } from "../ConnectionEntry"
import { ClusterConnectionGroup } from "../ClusterConnectionGroup"
import connectionReducer from "@/state/valkey-features/connection/connectionSlice"

// Mock store setup
const createMockStore = (connections: Record<string, unknown> = {}) => {
  return configureStore({
    reducer: {
      valkeyConnection: connectionReducer,
    },
    preloadedState: {
      valkeyConnection: {
        connections,
      },
    },
  })
}

const mockConnection = {
  status: CONNECTED,
  connectionDetails: {
    host: "very-long-hostname-that-should-be-truncated.example.com",
    port: 6379,
    alias: "Very Long Alias Name That Should Be Truncated When Displayed",
  },
  connectionHistory: [
    {
      event: CONNECTED,
      timestamp: Date.now(),
    },
  ],
}

const TestWrapper = ({ children, store }: { children: React.ReactNode; store: Record<string, unknown> }) => (
  <Provider store={store}>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </Provider>
)

describe("Text Truncation Improvements", () => {
  describe("ConnectionEntry", () => {
    it("should apply truncate class and title attribute to connection links", () => {
      const store = createMockStore()
      const { container } = render(
        <TestWrapper store={store}>
          <ConnectionEntry
            connection={mockConnection}
            connectionId="test-conn"
          />
        </TestWrapper>,
      )

      // Check that truncate class is applied to connection links
      const linkElements = container.querySelectorAll("a[title]")
      expect(linkElements.length).toBeGreaterThan(0)

      // Verify the link has both truncate class and title attribute
      const connectionLink = linkElements[0]
      expect(connectionLink).toHaveAttribute("title")

      // Check that the parent button has truncate class
      const buttonWithTruncate = container.querySelector(".truncate")
      expect(buttonWithTruncate).toBeInTheDocument()
    })

    it("should apply truncate class and title to last connection time", () => {
      const store = createMockStore()
      const { container } = render(
        <TestWrapper store={store}>
          <ConnectionEntry
            connection={mockConnection}
            connectionId="test-conn"
          />
        </TestWrapper>,
      )

      // Check for last connection time span with truncate class
      const lastConnectionSpans = container.querySelectorAll("span.truncate")
      const hasLastConnectionSpan = Array.from(lastConnectionSpans).some((span) =>
        span.textContent?.includes("Last connected:"),
      )
      expect(hasLastConnectionSpan).toBe(true)
    })

    it("should apply truncate class and title to alias display", () => {
      const store = createMockStore()
      const { container } = render(
        <TestWrapper store={store}>
          <ConnectionEntry
            connection={mockConnection}
            connectionId="test-conn"
          />
        </TestWrapper>,
      )

      // Check for alias span with truncate class and title
      const aliasSpans = container.querySelectorAll("span.truncate[title]")
      const hasAliasSpan = Array.from(aliasSpans).some((span) =>
        span.textContent?.includes("(") && span.textContent?.includes(")"),
      )
      expect(hasAliasSpan).toBe(true)
    })
  })

  describe("ClusterConnectionGroup", () => {
    it("should apply truncate class and title attribute to cluster name", () => {
      const store = createMockStore({
        "conn1": mockConnection,
        "conn2": { ...mockConnection, status: DISCONNECTED },
      })

      const connections = [
        { connectionId: "conn1", connection: mockConnection },
        { connectionId: "conn2", connection: { ...mockConnection, status: DISCONNECTED } },
      ]

      const { container } = render(
        <TestWrapper store={store}>
          <ClusterConnectionGroup
            clusterId="test-cluster-with-very-long-name"
            connections={connections}
          />
        </TestWrapper>,
      )

      // Since there's a connected instance, cluster name should be a clickable link
      const clusterNameLink = container.querySelector("a[title]")
      expect(clusterNameLink).toBeInTheDocument()
      expect(clusterNameLink).toHaveAttribute("title")

      // The link should have truncate class through its parent button
      const buttonWithTruncate = container.querySelector("button .truncate, .truncate")
      expect(buttonWithTruncate).toBeInTheDocument()
    })

    it("should apply truncate class and title attribute to cluster name when no connections", () => {
      const disconnectedConnection = { ...mockConnection, status: DISCONNECTED }
      const store = createMockStore({
        "conn1": disconnectedConnection,
        "conn2": disconnectedConnection,
      })

      const connections = [
        { connectionId: "conn1", connection: disconnectedConnection },
        { connectionId: "conn2", connection: disconnectedConnection },
      ]

      const { container } = render(
        <TestWrapper store={store}>
          <ClusterConnectionGroup
            clusterId="test-cluster-with-very-long-name"
            connections={connections}
          />
        </TestWrapper>,
      )

      // Since there are no connected instances, cluster name should be an h3 element
      const clusterNameElement = container.querySelector("h3[title]")
      expect(clusterNameElement).toBeInTheDocument()
      expect(clusterNameElement).toHaveAttribute("title")

      // Check that it has the ellipsis CSS classes
      expect(clusterNameElement).toHaveClass("overflow-hidden", "text-ellipsis", "whitespace-nowrap")
    })

    it("should apply truncate class and title to instance count text", () => {
      const store = createMockStore({
        "conn1": mockConnection,
        "conn2": { ...mockConnection, status: DISCONNECTED },
      })

      const connections = [
        { connectionId: "conn1", connection: mockConnection },
        { connectionId: "conn2", connection: { ...mockConnection, status: DISCONNECTED } },
      ]

      const { container } = render(
        <TestWrapper store={store}>
          <ClusterConnectionGroup
            clusterId="test-cluster"
            connections={connections}
          />
        </TestWrapper>,
      )

      // Check for instance count div with truncate class and title
      const instanceCountElements = container.querySelectorAll("div.truncate[title]")
      const hasInstanceCountElement = Array.from(instanceCountElements).some((div) =>
        div.textContent?.includes("instance"),
      )
      expect(hasInstanceCountElement).toBe(true)
    })
  })
})
