import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { registerWindowIpc } from './ipc/window'
import { registerAuthIpc } from './ipc/auth'
import { registerModpackIpc } from './ipc/modpacks'
import { registerSettingsIpc } from './ipc/settings'
import { registerDiscoverIpc } from './ipc/discover'
import { registerUpdateIpc } from './ipc/update'
import { initAutoUpdater } from './updater'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f1117',
    icon,
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

app.whenReady().then(() => {
  // Windows groups taskbar entries by AppUserModelID; without it the window
  // inherits the default Electron icon instead of ours.
  if (process.platform === 'win32') app.setAppUserModelId('com.c2launcher.app')

  registerWindowIpc()
  registerAuthIpc()
  registerModpackIpc()
  registerSettingsIpc()
  registerDiscoverIpc()
  registerUpdateIpc()
  createWindow()
  initAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
