import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { mkdir } from 'fs/promises'
import { promisify } from 'util'
import { IpcChannel } from '@shared/ipc-channels'
import type { AppSettings } from '@shared/types'
import {
  getDataDir,
  getSettings,
  setDataDirOverride,
  setJavaOverride,
  setPreferDedicatedGpu
} from '../settings/store'

const execFileAsync = promisify(execFile)

/** Confirms the chosen file is actually a runnable Java by invoking -version. */
async function validateJava(path: string): Promise<void> {
  try {
    await execFileAsync(path, ['-version'])
  } catch {
    throw new Error('That file is not a working Java executable')
  }
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

  ipcMain.handle(IpcChannel.SettingsChooseDataDir, async (event): Promise<void> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose data folder',
      properties: ['openDirectory' as const, 'createDirectory' as const]
    }
    const { canceled, filePaths } =
      win !== null ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const dir = filePaths[0]
    if (canceled || dir === undefined) return
    setDataDirOverride(dir)
    // The data dir is read all over the app at startup; a relaunch is the
    // clean way to repoint everything. Existing instances stay where they are.
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle(IpcChannel.SettingsSetGpuPref, (_e, enabled: boolean): AppSettings => {
    setPreferDedicatedGpu(enabled)
    return getSettings()
  })

  ipcMain.handle(IpcChannel.SettingsResetDataDir, (): void => {
    setDataDirOverride(null)
    app.relaunch()
    app.exit(0)
  })
}
