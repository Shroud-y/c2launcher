import { app, Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'
import { createWindow, getMainWindow, revealWindow } from './index'

// Module-level reference: a Tray that gets garbage-collected disappears from
// the system tray, so we must hold onto it for the app's lifetime.
let tray: Tray | null = null

/** Show and focus the main window, recreating it if it has been closed. */
function showMainWindow(): void {
  const win = getMainWindow()
  if (win === null) {
    createWindow()
    return
  }
  revealWindow(win)
}

/**
 * Create the system-tray icon and its context menu. On Linux/GNOME the icon
 * may not render without an AppIndicator extension; that does not affect the
 * hide/show logic and the tray is primarily for Windows.
 */
export function createTray(): void {
  if (tray !== null) return

  // resources/icon.png is 1024×1024 — far larger than a tray slot. Windows
  // renders an oversized icon as blank (a clickable but empty spot), so
  // downscale to the conventional 16×16 logical tray size; Electron handles
  // the per-monitor DPI scaling from there.
  const image = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip('C² Launcher')

  const menu = Menu.buildFromTemplate([
    { label: 'C² Launcher', enabled: false },
    { type: 'separator' },
    { label: 'Open C² Launcher', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)

  // Double-clicking the tray icon (common on Windows) reopens the window.
  tray.on('double-click', () => showMainWindow())
}
