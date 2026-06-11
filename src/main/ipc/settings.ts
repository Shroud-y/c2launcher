import { ipcMain, shell } from 'electron'
import { mkdir } from 'fs/promises'
import { IpcChannel } from '@shared/ipc-channels'
import type { AppSettings } from '@shared/types'
import { getDataDir, getSettings } from '../settings/store'

export function registerSettingsIpc(): void {
  ipcMain.handle(IpcChannel.SettingsGet, (): AppSettings => getSettings())

  ipcMain.handle(IpcChannel.SettingsOpenDataDir, async (): Promise<void> => {
    const dir = getDataDir()
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
}
