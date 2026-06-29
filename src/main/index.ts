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

// A lightweight splash shown during the cold start (slow first launch after a
// reboot: cold disk, AV scan of the unsigned exe, JIT). The heavy main window
// renders behind show:false; the splash gives immediate visible feedback and
// is closed the moment the main window is ready.
let splashWindow: BrowserWindow | null = null

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

// Inline splash markup — no renderer build, no extra file, no dependencies.
// Matches the app background (#0f1117) so there is no flash before paint.
const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0f1117;color:#e6e8ee;overflow:hidden;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-user-select:none}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
  .title{font-size:22px;font-weight:600;letter-spacing:.5px}
  .sub{font-size:13px;color:#8b90a0}
  .spinner{width:34px;height:34px;border-radius:50%;border:3px solid #2a2f3d;
    border-top-color:#5b8cff;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head><body><div class="wrap">
  <div class="spinner"></div>
  <div class="title">C² Launcher</div>
  <div class="sub">Запуск…</div>
</div></body></html>`

/** Create and show the splash window. Safe to call once at startup. */
export function createSplash(): void {
  const splash = new BrowserWindow({
    width: 360,
    height: 240,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#0f1117',
    icon,
    skipTaskbar: true
  })
  splashWindow = splash
  splash.on('closed', () => {
    if (splashWindow === splash) splashWindow = null
  })
  splash.once('ready-to-show', () => splash.show())
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`)
}

function closeSplash(): void {
  if (splashWindow !== null && !splashWindow.isDestroyed()) splashWindow.close()
  splashWindow = null
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
    // Hand off from the splash to the real window in one frame: close the
    // splash, then show the main window. The main window already exists by
    // now, so closing the splash never trips window-all-closed.
    closeSplash()
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
  // Splash first so something is on screen immediately, then build the heavy
  // main window behind it (show:false). ready-to-show closes the splash.
  createSplash()
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
