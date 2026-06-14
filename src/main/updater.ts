import { app } from 'electron'
import pkg from 'electron-updater'

/**
 * Launcher self-update via electron-updater. Reads the `publish` block in
 * electron-builder.yml (GitHub Releases) to find newer builds, downloads
 * them in the background and installs on quit. No-ops in development and
 * for unpackaged runs, where there is no update feed to query.
 */

// electron-updater ships CommonJS; the autoUpdater singleton is a named
// member of the default export.
const { autoUpdater } = pkg

export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('Auto-update check failed:', err.message)
  })

  // Surfacing progress/UI is out of scope for now — silently fetch and
  // stage the update so it applies on the next quit.
  void autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('Auto-update check failed:', message)
  })
}
