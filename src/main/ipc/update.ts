import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import { downloadUpdate } from '../updater'

export function registerUpdateIpc(): void {
  ipcMain.handle(IpcChannel.UpdateInstall, () => {
    downloadUpdate()
  })
}
