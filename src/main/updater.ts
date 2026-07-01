import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import { IpcChannel } from '@shared/ipc-channels'

/**
 * Launcher self-update via electron-updater. Reads the `publish` block in
 * electron-builder.yml (GitHub Releases) to find newer builds.
 *
 * Flow is manual: on launch we check once for an update and, if one exists,
 * tell the renderer so it can show an "Update" button. Nothing is downloaded
 * until the user clicks it (`downloadUpdate`), and the install only happens
 * after the download finishes (`quitAndInstall`). No-ops in development and
 * for unpackaged runs, where there is no update feed to query.
 */

// electron-updater ships CommonJS; the autoUpdater singleton is a named
// member of the default export.
const { autoUpdater } = pkg

function broadcast(channel: IpcChannel, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function initAutoUpdater(): void {
  if (!app.isPackaged) return

  // Manual flow: surface the update in the UI, let the user pull the trigger.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    broadcast(IpcChannel.UpdateAvailable, { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcast(IpcChannel.UpdateProgress, {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    finishInstall()
  })

  autoUpdater.on('error', (err) => {
    broadcast(IpcChannel.UpdateError, { message: err.message })
    console.error('Auto-update check failed:', err.message)
  })

  void autoUpdater.checkForUpdates().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('Auto-update check failed:', message)
  })
}

/** Triggered by the renderer's Update button: download, then install on finish. */
export function downloadUpdate(): void {
  void autoUpdater.downloadUpdate().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'unknown error'
    broadcast(IpcChannel.UpdateError, { message })
    console.error('Update download failed:', message)
  })
}

/**
 * Move from a finished download to the actual install. Tell the renderer we're
 * installing first, then give its overlay a moment to paint the "restarting
 * automatically" state before the window disappears — otherwise the app just
 * vanishes and the update reads as a freeze.
 *
 * quitAndInstall(true, true): isSilent=true passes /S to the NSIS installer so
 * the assisted-installer wizard never appears; isForceRunAfter=true reopens the
 * app once it finishes.
 */
function finishInstall(): void {
  broadcast(IpcChannel.UpdateInstalling)
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500)
}

/**
 * Dev-only preview: emit a fake download→install sequence so the overlay,
 * progress and state changes can be seen without a real update feed. Guarded to
 * unpackaged runs; never touches electron-updater.
 */
export function simulateUpdate(): void {
  if (app.isPackaged) return

  const total = 120 * 1024 * 1024 // 120 MB
  let transferred = 0
  const step = total / 40

  const timer = setInterval(() => {
    transferred = Math.min(total, transferred + step)
    broadcast(IpcChannel.UpdateProgress, {
      percent: Math.round((transferred / total) * 100),
      bytesPerSecond: step * 5,
      transferred,
      total
    })
    if (transferred >= total) {
      clearInterval(timer)
      // Mirror the real flow's installing state, but never actually quit.
      setTimeout(() => broadcast(IpcChannel.UpdateInstalling), 400)
    }
  }, 150)
}
