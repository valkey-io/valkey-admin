import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import { MemoryRouter, Route, Routes } from "react-router"
import { formatBytes } from "@common/src/bytes-conversion"
import DonutChart from "./donut-chart"
import { ChartModal } from "./chart-modal"
import keyBrowser, { getKeysRequested, getKeysFulfilled } from "@/state/valkey-features/keys/keyBrowserSlice"

describe("Key Distribution Chart", () => {
  it("preserves filtered results and continuation when opened and reopened", () => {
    const store = configureStore({ reducer: { keyBrowser } })
    const request = getKeysRequested({ connectionId: "db0", pattern: "user:*", keyType: "hash" })
    store.dispatch(request)
    store.dispatch(getKeysFulfilled({
      ...request.payload,
      keys: [{ name: "user:1", type: "hash", size: 64, ttl: -1 }],
      cursor: "next-page", totalKeys: 20000,
    }))
    const before = store.getState()
    const dispatch = vi.spyOn(store, "dispatch")
    const view = (open: boolean) => (
      <Provider store={store}>
        <MemoryRouter initialEntries={["/db0"]}>
          <Routes>
            <Route element={
              <ChartModal onClose={() => {}} open={open} subtitle="Loaded keys" title="Distribution">
                <DonutChart />
              </ChartModal>
            } path="/:id" />
          </Routes>
        </MemoryRouter>
      </Provider>
    )
    const { rerender } = render(view(false))
    rerender(view(true))
    expect(screen.getByText(`Total Memory: ${formatBytes(64)}`)).toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalled()
    expect(store.getState()).toBe(before)
    rerender(view(false))
    rerender(view(true))
    expect(dispatch).not.toHaveBeenCalled()
    expect(store.getState().keyBrowser.db0).toMatchObject({
      pattern: "user:*", keyType: "hash", cursor: "next-page", pageLoading: false,
    })
    expect(store.getState().keyBrowser.db0.keys).toHaveLength(1)
  })
})
