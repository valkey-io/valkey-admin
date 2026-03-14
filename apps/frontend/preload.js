// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("secureStorage", {
  encrypt: (password) => ipcRenderer.invoke("secure-storage:encrypt", password),
  decrypt: (encrypted) => ipcRenderer.invoke("secure-storage:decrypt", encrypted),
})

contextBridge.exposeInMainWorld("electronNavigation", {
  onNavigate: (callback) => {
    ipcRenderer.on("navigate", (_event, route) => callback(route))
  },
})
