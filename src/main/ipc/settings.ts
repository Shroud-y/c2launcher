import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { mkdir, rm, statfs } from 'fs/promises'
import { join, relative, resolve } from 'path'
import { promisify } from 'util'
import { IpcChannel } from '@shared/ipc-channels'
import type { AppSettings, DataMigrateProgress, DataMigrateResult } from '@shared/types'
import {
  getDataDir,
  getSettings,
  setDataDirOverride,
  setJavaOverride,
  setMinimizeToTrayOnLaunch,
  setPreferDedicatedGpu
} from '../settings/store'
import {
  MIGRATE_DIRS,
  copyTree,
  dirSize,
  formatBytes,
  hasEntries,
  isInside
} from '../settings/dataMigrate'
import { hasRunningGames } from './modpacks'

const execFileAsync = promisify(execFile)

/** Confirms the chosen file is actually a runnable Java by invoking -version. */
async function validateJava(path: string): Promise<void> {
  try {
    await execFileAsync(path, ['-version'])
  } catch {
    throw new Error('That file is not a working Java executable')
  }
}

/** Pushes a migration-progress event to every open window. */
function sendMigrateProgress(payload: DataMigrateProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannel.SettingsDataMigrateProgress, payload)
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerSettingsIpc(): void {
  ipcMain.handle(IpcChannel.SettingsGet, (): AppSettings => getSettings())

  ipcMain.handle(IpcChannel.SettingsOpenDataDir, async (): Promise<void> => {
    const dir = getDataDir()
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle(IpcChannel.SettingsChooseJava, async (event): Promise<AppSettings> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Select Java executable',
      properties: ['openFile' as const],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : []
    }
    const { canceled, filePaths } =
      win !== null ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const filePath = filePaths[0]
    if (canceled || filePath === undefined) return getSettings()
    await validateJava(filePath)
    setJavaOverride(filePath)
    return getSettings()
  })

  ipcMain.handle(IpcChannel.SettingsClearJava, (): AppSettings => {
    setJavaOverride(null)
    return getSettings()
  })

  ipcMain.handle(IpcChannel.SettingsChooseDataDir, async (event): Promise<DataMigrateResult> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const pickOptions = {
      title: 'Choose data folder',
      properties: ['openDirectory' as const, 'createDirectory' as const]
    }
    const { canceled, filePaths } =
      win !== null
        ? await dialog.showOpenDialog(win, pickOptions)
        : await dialog.showOpenDialog(pickOptions)
    const target = filePaths[0]
    if (canceled || target === undefined) return { status: 'canceled' }

    const source = getDataDir()
    if (resolve(source) === resolve(target)) return { status: 'canceled' }

    // Moving files under a live game would copy them half-written or fail to
    // delete the source — refuse until everything is stopped.
    if (hasRunningGames()) {
      return {
        status: 'error',
        message: 'Close the running game before changing the data folder.'
      }
    }

    // A nested source/target would recurse forever while copying and could wipe
    // the freshly copied data when the source is deleted afterwards.
    if (isInside(target, source) || isInside(source, target)) {
      return {
        status: 'error',
        message: 'Choose a folder that is not inside the current data folder (or vice versa).'
      }
    }

    // Only the game-data folders that actually hold something need moving.
    const present: string[] = []
    for (const name of MIGRATE_DIRS) {
      if (await hasEntries(join(source, name))) present.push(name)
    }

    // Nothing to move — just repoint and relaunch, the original behaviour.
    if (present.length === 0) {
      setDataDirOverride(target)
      app.relaunch()
      app.exit(0)
      return { status: 'ok' }
    }

    // Refuse to merge into a folder that already holds game data: the failure
    // cleanup below would otherwise risk deleting the user's existing files.
    for (const name of MIGRATE_DIRS) {
      if (await hasEntries(join(target, name))) {
        return {
          status: 'error',
          message:
            'The chosen folder already contains game data. Pick an empty folder, or use ' +
            '"Keep in place" to point the launcher there without moving anything.'
        }
      }
    }

    const choiceOptions = {
      type: 'question' as const,
      buttons: ['Move', 'Copy', 'Keep in place', 'Cancel'],
      defaultId: 0,
      cancelId: 3,
      title: 'Move game data?',
      message: 'Move your instances and game files to the new folder?',
      detail:
        'Move — copy to the new folder, then delete the originals.\n' +
        'Copy — copy to the new folder and keep the originals.\n' +
        'Keep in place — point the launcher at the new folder without moving anything.'
    }
    const { response } =
      win !== null
        ? await dialog.showMessageBox(win, choiceOptions)
        : await dialog.showMessageBox(choiceOptions)

    // Button order above: 0 Move, 1 Copy, 2 Keep in place, 3 Cancel.
    if (response === 3) return { status: 'canceled' }
    if (response === 2) {
      setDataDirOverride(target)
      app.relaunch()
      app.exit(0)
      return { status: 'ok' }
    }
    const move = response === 0 // otherwise Copy

    // Sum what we are about to copy and make sure the target can hold it.
    let totalBytes = 0
    for (const name of present) totalBytes += await dirSize(join(source, name))
    try {
      const fsStat = await statfs(target)
      const available = fsStat.bsize * fsStat.bavail
      if (available < totalBytes) {
        return {
          status: 'error',
          message: `Not enough free space: need ${formatBytes(totalBytes)}, ${formatBytes(available)} available.`
        }
      }
    } catch {
      // statfs can fail on exotic filesystems; let the copy surface real I/O errors.
    }

    // Copy first; the source and the override are only touched after full success.
    let copied = 0
    let lastEmit = 0
    const onFile = (bytes: number, file: string): void => {
      copied += bytes
      const now = Date.now()
      if (now - lastEmit >= 100 || copied >= totalBytes) {
        lastEmit = now
        sendMigrateProgress({
          copiedBytes: copied,
          totalBytes,
          currentFile: relative(source, file)
        })
      }
    }
    try {
      sendMigrateProgress({ copiedBytes: 0, totalBytes, currentFile: '' })
      for (const name of present) {
        await copyTree(join(source, name), join(target, name), onFile)
      }
    } catch (err) {
      // Roll back the partial copy; the source is left untouched.
      for (const name of MIGRATE_DIRS) {
        await rm(join(target, name), { recursive: true, force: true }).catch(() => undefined)
      }
      return { status: 'error', message: `Copy failed: ${errorMessage(err)}` }
    }

    // Copy succeeded. For a move, the source copies can now go.
    if (move) {
      for (const name of present) {
        await rm(join(source, name), { recursive: true, force: true }).catch(() => undefined)
      }
    }

    setDataDirOverride(target)
    app.relaunch()
    app.exit(0)
    return { status: 'ok' }
  })

  ipcMain.handle(IpcChannel.SettingsSetGpuPref, (_e, enabled: boolean): AppSettings => {
    setPreferDedicatedGpu(enabled)
    return getSettings()
  })

  ipcMain.handle(IpcChannel.SettingsSetMinimizeToTray, (_e, enabled: boolean): AppSettings => {
    setMinimizeToTrayOnLaunch(enabled)
    return getSettings()
  })

  ipcMain.handle(IpcChannel.SettingsResetDataDir, (): void => {
    setDataDirOverride(null)
    app.relaunch()
    app.exit(0)
  })
}
