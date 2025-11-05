const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let serverProcess;
let metricsProcess;

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

function startMetrics() {
    if (app.isPackaged) {
        const serverPath = path.join(process.resourcesPath, 'server-metrics.js');
        console.log(`Starting metrics server from: ${serverPath}`);
        metricsProcess = fork(serverPath);

        metricsProcess.on('close', (code) => {
            console.log(`Metrics server exited with code ${code}`);
        });
        metricsProcess.on('error', (err) => {
            console.error(`Metrics server error: ${err}`);
        });
    }
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
    startMetrics();
    if (serverProcess) {
        serverProcess.on('message', (message) => {
            if (message === 'ready') {
                createWindow();
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
    if (metricsProcess) {
        metricsProcess.kill();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
