import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { IpcChannel } from '@shared/ipc-channels'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowControls(): void {
  ipcMain.on(IpcChannel.WindowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on(IpcChannel.WindowMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })
  ipcMain.on(IpcChannel.WindowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

app.whenReady().then(() => {
  registerWindowControls()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
