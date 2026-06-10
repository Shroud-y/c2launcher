import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { basename, join } from 'path'
import { mkdir } from 'fs/promises'
import { IpcChannel } from '@shared/ipc-channels'
import type { AppSettings } from '@shared/types'
import { getDataDir, getSettings, moveDataDir } from '../settings/store'
import { isAnyModpackBusy } from './modpacks'

const DATA_FOLDER_NAME = 'C2Launcher'

export function registerSettingsIpc(): void {
  ipcMain.handle(IpcChannel.SettingsGet, (): AppSettings => getSettings())

  ipcMain.handle(IpcChannel.SettingsOpenDataDir, async (): Promise<void> => {
    const dir = getDataDir()
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle(IpcChannel.SettingsChooseDataDir, async (event): Promise<AppSettings> => {
    if (isAnyModpackBusy()) {
      throw new Error('Stop the game and wait for installs to finish before moving data')
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose data folder',
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
    }
    const result = win !== null
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return getSettings()

    const picked = result.filePaths[0]
    // Nest our folder unless the user already picked/created one named so.
    const target = basename(picked) === DATA_FOLDER_NAME ? picked : join(picked, DATA_FOLDER_NAME)
    return moveDataDir(target)
  })
}
