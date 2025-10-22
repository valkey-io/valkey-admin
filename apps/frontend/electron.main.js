const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let serverProcess;

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
        //win.webContents.openDevTools(); // open DevTools for debugging
    } else {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    startServer();
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
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
