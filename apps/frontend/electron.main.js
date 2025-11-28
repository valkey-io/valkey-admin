const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let serverProcess;
let metricsProcesses = new Map();

function startServer() {
    if (app.isPackaged) {
        const serverPath = path.join(process.resourcesPath, 'server-backend.js');
        console.log(`Starting backend server from: ${serverPath}`);
        serverProcess = fork(serverPath);

        serverProcess.on('close', (code) => {
            console.log(`Backend server exited with code ${code}`);
        });
        serverProcess.on('error', (err) => {
            console.error(`Backend server error: ${err}`);
        });
    }
}

function startMetricsForClusterNodes(clusterNodes) {
    Object.values(clusterNodes).forEach(node => {
        const connectionDetails = {
            host: node.host,
            port: node.port,
        }
        
        const connectionId = `${node.host}-${node.port}`
        if(!metricsProcesses.has(connectionId)) {
            startMetrics(connectionId, connectionDetails)
        }
    })
}

function startMetrics(serverConnectionId, serverConnectionDetails) {
    const dataDir = path.join(app.getPath('userData'), 'metrics-data', serverConnectionId);

    let metricsServerPath;
    let configPath;

    if (app.isPackaged) {
        metricsServerPath = path.join(process.resourcesPath, 'server-metrics.js');
        configPath = path.join(process.resourcesPath, 'config.yml'); // Path for production
    } else {
        metricsServerPath = path.join(__dirname, '../../metrics/src/index.js');
        configPath = path.join(__dirname, '../../metrics/config.yml'); // Path for development
    }

    console.log(`Starting metrics server for connection ${serverConnectionId}...`);

    const metricsProcess = fork(metricsServerPath, [], {
        env: {
            ...process.env,
            PORT: 0,
            DATA_DIR: dataDir,
            VALKEY_URL: `valkey://${serverConnectionDetails.host}:${serverConnectionDetails.port}`,
            CONFIG_PATH: configPath // Explicitly provide the config path
        }
    });

    metricsProcesses.set(serverConnectionId, metricsProcess);

    metricsProcess.on('message', (message) => {
        if (message && message.type === 'metrics-started') {
            console.log(`Metrics server for ${serverConnectionId} started successfully on host: ${message.payload.metricsHost} port ${message.payload.metricsPort}`);
            serverProcess.send?.({
                ...message,
                payload: {
                    ...message.payload,
                    serverConnectionId: serverConnectionId
                }
            });
        }
    });

    metricsProcess.on('close', (code) => {
        console.log(`Metrics server for connection ${serverConnectionId} exited with code ${code}`);
        metricsProcesses.delete(serverConnectionId);
        serverProcess.send({
            type: 'metrics-closed',
            payload: {
                serverConnectionId,
            }
        })
    });

    metricsProcess.on('error', (err) => {
        console.error(`Metrics server for connection ${serverConnectionId} error: ${err}`);
    });
}


// Disconnect functionality in the server has not been implemented. Once that is implemented, this can be used.
function stopMetricServer(serverConnectionId) {
    metricsProcesses.get(serverConnectionId).kill();
}

function stopMetricServers() {
    metricsProcesses.forEach((_serverConnectionId, metricProcess) => {
        metricProcess.kill();
    })
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    if (app.isPackaged) {
        win.loadFile(path.join(__dirname, 'dist', 'index.html'));
    } else {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    startServer();
    if (serverProcess) {
        serverProcess.on('message', (message) => {
            switch (message.type) {
                case 'websocket-ready':
                    createWindow();
                    break;
                case 'valkeyConnection/standaloneConnectFulfilled':
                    startMetrics(message.payload.connectionId, message.payload.connectionDetails);
                    break;
                case 'valkeyConnection/clusterConnectFulfilled':
                    startMetricsForClusterNodes(message.payload.clusterNodes )
                default:
                    try {
                        console.log(`Received unknown server message: ${JSON.stringify(message)}`);
                    } catch (_) {
                        console.log(`Received unknown server message: ${message}`);
                    }

            }
        });
    } else {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
    if (metricsProcesses.length > 0) {
        stopMetricServers();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
