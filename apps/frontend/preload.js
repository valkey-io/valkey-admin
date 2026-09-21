// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require("electron")

// The main process passes the per-launch WebSocket token via additionalArguments.
const wsTokenArg = process.argv.find((arg) => arg.startsWith("--valkey-admin-ws-token="))
const wsToken = wsTokenArg ? wsTokenArg.slice("--valkey-admin-ws-token=".length) : ""

contextBridge.exposeInMainWorld("valkeyAdminRuntime", {
  wsToken,
})

contextBridge.exposeInMainWorld("secureStorage", {
  encrypt: (password) => ipcRenderer.invoke("secure-storage:encrypt", password),
  decrypt: (encrypted) => ipcRenderer.invoke("secure-storage:decrypt", encrypted),
  isEncryptionAvailable: () => ipcRenderer.invoke("secure-storage:is-encryption-available"),
})

contextBridge.exposeInMainWorld("electronNavigation", {
  onNavigate: (callback) => {
    ipcRenderer.on("navigate", (_event, route) => callback(route))
  },
})
