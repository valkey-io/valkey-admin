/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, safeStorage, shell, powerMonitor, session } = require("electron")
const path = require("path")
const { fork } = require("child_process")
const crypto = require("crypto")
const { createApplicationMenu } = require("./menu")

let serverProcess
const ELECTRON = "Electron"
// Per-launch secret shared with the backend so only this app's renderer can open
// the WebSocket. Regenerated every launch; never persisted.
const wsToken = crypto.randomBytes(32).toString("hex")
function startServer() {
  if (app.isPackaged) {
    const serverPath = path.join(process.resourcesPath, "server-backend.cjs")
    console.log(`Starting backend server from: ${serverPath}`)
    serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        DEPLOYMENT_MODE: ELECTRON,
        ELECTRON_WS_TOKEN: wsToken,
        PROCESS_RESOURCES_PATH: process.resourcesPath,
        DATA_DIR: path.join(app.getPath("userData"), "metrics-data"),
      },
    })

    serverProcess.on("close", (code) => {
      console.log(`Backend server exited with code ${code}`)
    })
    serverProcess.on("error", (err) => {
      console.error(`Backend server error: ${err}`)
    })
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "assets/img/logo-big.png"),
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // Hand the per-launch token to the preload (readable via process.argv).
      additionalArguments: [`--valkey-admin-ws-token=${wsToken}`],
    },
  })

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, "dist", "index.html"))
  } else {
    win.loadURL("http://localhost:5173")
    win.webContents.openDevTools()
  }
}

app.whenReady().then(() => {
  // Enforce Content Security Policy for the renderer
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' ws://localhost:* http://localhost:*; " +
          "img-src 'self' data:; font-src 'self'; " +
          "object-src 'none'; base-uri 'self'; form-action 'self';",
        ],
      },
    })
  })

  createApplicationMenu()
  startServer()
  if (serverProcess) {
    serverProcess.on("message", (message) => {
      switch (message.type) {
        case "websocket-ready":
          createWindow()
          break
        default:
          try {
            console.warn(`Received unknown server message: ${JSON.stringify(message)}`)
          } catch (e) {
            console.error(`Received unknown server message: ${message}. Error: `, e)
          }

      }
    })
  } else {
    createWindow()
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", () => {
  cleanupAndExit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

powerMonitor.on("suspend", () => {
  console.log("System suspending")
  serverProcess.send({
    type: "system-suspended",
  })
  
})

powerMonitor.on("resume", () => {
  console.log("System resumed")
  serverProcess.send({
    type: "system-resumed",
  })
})

ipcMain.handle("secure-storage:is-encryption-available", async () => safeStorage.isEncryptionAvailable())

ipcMain.handle("secure-storage:encrypt", async (event, password) => {
  if (!password) return { ok: true, value: "" }
  // Fail closed: never return the plaintext password when the OS has no secure
  // store, so the renderer can't persist an unprotected secret while implying it
  // is encrypted. The caller keeps the plaintext for the live connection and marks
  // it do-not-persist.
  if (!safeStorage.isEncryptionAvailable()) return { ok: false }
  return { ok: true, value: safeStorage.encryptString(password).toString("base64") }
})

ipcMain.handle("secure-storage:decrypt", async (event, encryptedBase64) => {
  if (!encryptedBase64 || !safeStorage.isEncryptionAvailable()) return encryptedBase64 || ""
  try {
    const encrypted = Buffer.from(encryptedBase64, "base64")
    return safeStorage.decryptString(encrypted)
  } catch {
    return encryptedBase64
  }
})

process.on("SIGINT", cleanupAndExit)
process.on("SIGTERM", cleanupAndExit)

function cleanupAndExit() {
  console.log("Cleaning up ...")
  if (serverProcess) serverProcess.kill()
}
