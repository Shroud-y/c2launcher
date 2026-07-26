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
import { migrateLegacyUserData } from './settings/legacyUserData'
import { rescueDataDirFromInstallDir } from './settings/installDirRescue'
import { signalSplashReady, setSplashStatus } from './splashHandoff'

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

// Single-instance: a second launch focuses the running window instead of
// starting a rival process that would fight over the same instance folders and
// electron-store files. Must run before whenReady so the loser exits early.
//
// The splash stub has its own mutex, but that only covers the window where the
// splash is still up; once it closes, a second double-click reaches this. The
// loser has to signal the splash before quitting or its splash would hang until
// the stub's watchdog fires.
const gotInstanceLock = app.requestSingleInstanceLock()
if (!gotInstanceLock) {
  signalSplashReady()
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) revealWindow(win)
    else createWindow()
  })
}

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
    // Our first real frame is up — this is the handoff point, so retire the
    // native splash. Order matters: show() first, so the splash is never torn
    // down before there is something behind it to look at.
    signalSplashReady()
  })

  // A renderer that fails to load would otherwise leave the splash covering a
  // broken window until the stub's watchdog gave up. Main frame only: a failed
  // subframe (an embedded Modrinth resource, say) is not a startup failure and
  // must not retire the splash early.
  win.webContents.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame) signalSplashReady()
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

if (gotInstanceLock) {
  app.whenReady().then(async () => {
    try {
      // Windows groups taskbar entries by AppUserModelID; without it the window
      // inherits the default Electron icon instead of ours.
      if (process.platform === 'win32') app.setAppUserModelId('com.c2launcher.app')

      // Both must run before anything reads the config/registry stores or opens
      // a window: the first moves data orphaned by the v0.1.4 userData rename,
      // the second offers to pull game data out of the install folder before the
      // updater could wipe it.
      //
      // These are the slowest things that can happen before a window exists —
      // the migration copies whole instance trees — so they narrate to the
      // splash rather than leaving it on a generic message.
      setSplashStatus('Checking game data…')
      await migrateLegacyUserData()
      await rescueDataDirFromInstallDir()

      setSplashStatus('Starting launcher…')
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
    } catch (err) {
      // Anything thrown here means no window will ever open. Retire the splash
      // so the failure is visible instead of hidden behind a loading screen
      // that sits there until the watchdog fires.
      signalSplashReady()
      throw err
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
