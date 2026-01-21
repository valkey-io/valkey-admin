/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron")
const path = require("path")
const { fork } = require("child_process")

// TODO: import from common
const sanitizeUrl = (input) => input.replace(/[^a-zA-Z0-9_-]/g, "-")

let serverProcess
const metricsProcesses = new Map()

function startServer() {
  if (app.isPackaged) {
    const serverPath = path.join(process.resourcesPath, "server-backend.js")
    console.log(`Starting backend server from: ${serverPath}`)
    serverProcess = fork(serverPath)

    serverProcess.on("close", (code) => {
      console.log(`Backend server exited with code ${code}`)
    })
    serverProcess.on("error", (err) => {
      console.error(`Backend server error: ${err}`)
    })
  }
}

function startMetricsForClusterNodes(clusterNodes, credentials) {
  Object.values(clusterNodes).forEach((node) => {
    const connectionDetails = {
      host: node.host,
      port: node.port,
      username: credentials?.username,
      password: credentials?.password,
      tls: node.tls,
      verifyTlsCertificate: node.verifyTlsCertificate,
    }

    const connectionId = sanitizeUrl(`${node.host}-${node.port}`)
    if (!metricsProcesses.has(connectionId)) {
      startMetrics(connectionId, connectionDetails)
    }
  })
}

function startMetrics(serverConnectionId, serverConnectionDetails) {
  const dataDir = path.join(app.getPath("userData"), "metrics-data", serverConnectionId)

  let metricsServerPath
  let configPath

  const { host, port, username, password } = serverConnectionDetails

  if (app.isPackaged) {
    metricsServerPath = path.join(process.resourcesPath, "server-metrics.js")
    configPath = path.join(process.resourcesPath, "config.yml") // Path for production
  } else {
    metricsServerPath = path.join(__dirname, "../../metrics/src/index.js")
    configPath = path.join(__dirname, "../../metrics/config.yml") // Path for development
  }

  const metricsProcess = fork(metricsServerPath, [], {
    env: {
      ...process.env,
      PORT: 0,
      DATA_DIR: dataDir,
      VALKEY_HOST: host,
      VALKEY_PORT: port,
      VALKEY_USERNAME: username,
      VALKEY_PASSWORD: password,
      VALKEY_TLS: serverConnectionDetails.tls,
      VALKEY_VERIFY_CERT: serverConnectionDetails.verifyTlsCertificate,
      CONFIG_PATH: configPath, // Explicitly provide the config path
    },
  })

  metricsProcesses.set(serverConnectionId, metricsProcess)

  metricsProcess.on("message", (message) => {
    if (message && message.type === "metrics-started") {
      console.log(`Metrics server for ${serverConnectionId} started successfully on host: ${message.payload.metricsHost} port ${message.payload.metricsPort}`)
      serverProcess.send?.({
        ...message,
        payload: {
          ...message.payload,
          serverConnectionId: serverConnectionId,
        },
      })
    }
  })

  metricsProcess.on("close", (code) => {
    console.log(`Metrics server for connection ${serverConnectionId} exited with code ${code}`)
    metricsProcesses.delete(serverConnectionId)
    serverProcess.send({
      type: "metrics-closed",
      payload: {
        serverConnectionId,
      },
    })
  })

  metricsProcess.on("error", (err) => {
    console.error(`Metrics server for connection ${serverConnectionId} error: ${err}`)
  })
}

// Disconnect functionality in the server has not been implemented. Once that is implemented, this can be used.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function stopMetricServer(serverConnectionId) {
  metricsProcesses.get(serverConnectionId).kill()
}

function stopMetricServers() {
  metricsProcesses.forEach((metricProcess, serverConnectionId) => {
    try {
      metricProcess.kill()
    } catch (e) {
      console.warn(`Failed to kill metrics server ${serverConnectionId}:`, e)
    }
  })
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

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, "dist", "index.html"))
  } else {
    win.loadURL("http://localhost:5173")
    win.webContents.openDevTools()
  }
}

app.whenReady().then(() => {
  startServer()
  if (serverProcess) {
    serverProcess.on("message", (message) => {
      switch (message.type) {
        case "websocket-ready":
          createWindow()
          break
        case "valkeyConnection/standaloneConnectFulfilled":
          startMetrics(message.payload.connectionId, message.payload.connectionDetails)
          break
        case "valkeyConnection/clusterConnectFulfilled":
          startMetricsForClusterNodes(message.payload.clusterNodes, message.payload.credentials)
          break
        default:
          try {
            console.log(`Received unknown server message: ${JSON.stringify(message)}`)
          } catch (e) {
            console.log(`Received unknown server message: ${message}. Error: `, e)
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

ipcMain.handle("secure-storage:encrypt", async (event, password) => {
  if (!password || !safeStorage.isEncryptionAvailable()) return password
  const encrypted = safeStorage.encryptString(password)
  return encrypted.toString("base64")
})

ipcMain.handle("secure-storage:decrypt", async (event, encryptedBase64) => {
  if (!encryptedBase64 || !safeStorage.isEncryptionAvailable()) return ""
  try {
    const encrypted = Buffer.from(encryptedBase64, "base64")
    return safeStorage.decryptString(encrypted)
  } catch {
    return "" // TODO: Look into this case more closely
  }
})

process.on("SIGINT", cleanupAndExit)
process.on("SIGTERM", cleanupAndExit)

function cleanupAndExit() {
  console.log("Cleaning up ...")
  if (serverProcess) serverProcess.kill()
  if (metricsProcesses.size > 0) stopMetricServers()
  setTimeout(() => process.exit(0), 100)
}
