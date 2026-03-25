/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, safeStorage, shell, powerMonitor } = require("electron")
const path = require("path")
const { fork } = require("child_process")
const { createApplicationMenu } = require("./menu")

let serverProcess

function startServer() {
  if (app.isPackaged) {
    const serverPath = path.join(process.resourcesPath, "server-backend.cjs")
    console.log(`Starting backend server from: ${serverPath}`)
    serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        ELECTRON_APP: "true",
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
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
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

ipcMain.handle("secure-storage:encrypt", async (event, password) => {
  if (!password || !safeStorage.isEncryptionAvailable()) return password
  const encrypted = safeStorage.encryptString(password)
  return encrypted.toString("base64")
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
