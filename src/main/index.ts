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
import { createTray } from './tray'

// Module-level handle to the main window so the tray (and other main-process
// code) can show/hide it. Cleared on 'closed' so callers can detect a
// destroyed window and recreate it.
let mainWindow: BrowserWindow | null = null

/** The main window, or null if it has been closed/destroyed. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Bring a window to the foreground and give it real input focus. After a
 * hide() (e.g. minimize-to-tray on launch), a plain show()/focus() on Windows
 * can leave the window visible but inactive — its title bar greyed and clicks
 * ignored. The brief always-on-top bounce forces it to the front and makes it
 * the active window again so the very next click (e.g. Play) registers.
 */
export function revealWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  if (process.platform === 'win32') {
    win.setAlwaysOnTop(true)
    win.focus()
    win.setAlwaysOnTop(false)
  } else {
    win.focus()
  }
}

// Pin the data folder to a clean, shell-friendly name. productName is
// "C² Launcher" (kept for the installer and window title), which would
// otherwise put userData under "~/.config/C² Launcher" — the "²" and
// space make it awkward to cd into. This must run before anything reads
// userData/getDataDir(), or the default path gets baked in at the old
// location.
app.setPath('userData', join(app.getPath('appData'), 'c2launcher'))

export function createWindow(): void {
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

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => {
    // Show only once the renderer has painted, so there is no white flash
    // before the first frame (the window is created with show:false and a
    // matching backgroundColor).
    win.show()
  })

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
  createTray()
  initAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
