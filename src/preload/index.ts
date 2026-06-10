import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'

const api = {
  window: {
    minimize: (): void => ipcRenderer.send(IpcChannel.WindowMinimize),
    maximize: (): void => ipcRenderer.send(IpcChannel.WindowMaximize),
    close: (): void => ipcRenderer.send(IpcChannel.WindowClose)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
