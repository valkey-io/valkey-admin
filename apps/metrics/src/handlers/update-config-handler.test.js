import { describe, it, expect, vi, beforeEach } from "vitest"
import { ACTION } from "../utils/constants.js"

vi.mock("../config.js", () => ({
  getConfig: vi.fn(() => ({ epics: [{ name: "monitor" }, { name: "cpu" }] })),
  updateConfig: vi.fn(),
}))

vi.mock("./monitor-handler.js", () => ({
  monitorHandler: vi.fn().mockResolvedValue({}),
  readMonitorMetadata: vi.fn(),
}))

// Minimal express-shaped response recorder.
const mockRes = () => {
  const res = {
    statusCode: null,
    body: null,
    status: vi.fn((code) => { res.statusCode = code; return res }),
    json: vi.fn((body) => { res.body = body; return res }),
  }
  return res
}

const accepted = (epics) => ({ success: true, statusCode: 200, message: "", data: { epics } })

describe("update-config-handler", () => {
  let updateConfig
  let monitorHandler
  let readMonitorMetadata
  let updateConfigHandler

  beforeEach(async () => {
    vi.clearAllMocks()
    const configModule = await import("../config.js")
    const monitorModule = await import("./monitor-handler.js")
    updateConfig = configModule.updateConfig
    monitorHandler = monitorModule.monitorHandler
    readMonitorMetadata = monitorModule.readMonitorMetadata
    updateConfigHandler = (await import("./update-config-handler.js")).updateConfigHandler
  })

  it("restarts a running monitor when the monitor epic was updated", async () => {
    updateConfig.mockReturnValue(accepted({ monitor: { monitoringDuration: 15000 } }))
    readMonitorMetadata.mockReturnValue({ isRunning: true })
    const res = mockRes()

    await updateConfigHandler({ body: { epics: { monitor: { monitoringDuration: 15000 } } } }, res)

    // Stop before start, so the live stream cannot keep sampling with stale settings.
    expect(monitorHandler.mock.calls.map(([action]) => action)).toEqual([ACTION.STOP, ACTION.START])
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("does not restart the monitor when it is not running", async () => {
    updateConfig.mockReturnValue(accepted({ monitor: { monitoringDuration: 15000 } }))
    readMonitorMetadata.mockReturnValue({ isRunning: false })
    const res = mockRes()

    await updateConfigHandler({ body: { epics: { monitor: { monitoringDuration: 15000 } } } }, res)

    expect(monitorHandler).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  it("does not restart the monitor when only other epics were updated", async () => {
    updateConfig.mockReturnValue(accepted({ cpu: { poll_ms: 10000 } }))
    readMonitorMetadata.mockReturnValue({ isRunning: true })
    const res = mockRes()

    await updateConfigHandler({ body: { epics: { cpu: { poll_ms: 10000 } } } }, res)

    expect(monitorHandler).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  it("passes a rejected update through with its status and touches no monitor", async () => {
    updateConfig.mockReturnValue({
      success: false,
      statusCode: 400,
      message: "epics.monitor: Unrecognized key: \"file_prefix\"",
      data: {},
    })
    readMonitorMetadata.mockReturnValue({ isRunning: true })
    const res = mockRes()

    await updateConfigHandler({ body: { epics: { monitor: { file_prefix: "../../pwn" } } } }, res)

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toContain("file_prefix")
    expect(monitorHandler).not.toHaveBeenCalled()
    expect(readMonitorMetadata).not.toHaveBeenCalled()
  })

  it("returns 500 when the update throws", async () => {
    updateConfig.mockImplementation(() => { throw new Error("disk on fire") })
    const res = mockRes()

    await updateConfigHandler({ body: { epics: { monitor: { monitoringDuration: 15000 } } } }, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ success: false, message: "disk on fire" })
  })

  it("returns 500 when the monitor restart fails", async () => {
    updateConfig.mockReturnValue(accepted({ monitor: { monitoringDuration: 15000 } }))
    readMonitorMetadata.mockReturnValue({ isRunning: true })
    monitorHandler.mockRejectedValueOnce(new Error("monitor stuck"))
    const res = mockRes()

    await updateConfigHandler({ body: { epics: { monitor: { monitoringDuration: 15000 } } } }, res)

    expect(res.statusCode).toBe(500)
    expect(res.body.message).toBe("monitor stuck")
  })
})
