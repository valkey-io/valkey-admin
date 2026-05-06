/* eslint-disable @typescript-eslint/no-require-imports */
const { Menu, BrowserWindow, shell } = require("electron")

function createApplicationMenu() {
  const isMac = process.platform === "darwin"

  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "Shortcuts",
      submenu: [
        { label: "Connections", accelerator: isMac ? "Cmd+1" : "Ctrl+1", click: () => sendNavigationEvent("connect") },
        { label: "Dashboard", accelerator: isMac ? "Cmd+2" : "Ctrl+2", click: () => sendNavigationEvent("dashboard") },
        { label: "Key Browser", accelerator: isMac ? "Cmd+3" : "Ctrl+3", click: () => sendNavigationEvent("browse") },
        { label: "Monitoring", accelerator: isMac ? "Cmd+4" : "Ctrl+4", click: () => sendNavigationEvent("monitoring") },
        { label: "Send Command", accelerator: isMac ? "Cmd+5" : "Ctrl+5", click: () => sendNavigationEvent("sendcommand") },
        { label: "Cluster Topology", accelerator: isMac ? "Cmd+6" : "Ctrl+6", click: () => sendNavigationEvent("cluster-topology") },
        { label: "Settings", accelerator: isMac ? "Cmd+7" : "Ctrl+7", click: () => sendNavigationEvent("settings") },
        { label: "Learn More", accelerator: isMac ? "Cmd+8" : "Ctrl+8", click: () => sendNavigationEvent("learnmore") },

      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "GitHub Repository", click: async () => { await shell.openExternal("https://github.com/valkey-io/valkey-admin") } },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function sendNavigationEvent(route) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send("navigate", route)
  }
}

module.exports = { createApplicationMenu }
