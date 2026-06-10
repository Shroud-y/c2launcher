import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type { MinecraftProfile } from '@shared/types'

const api = {
  window: {
    minimize: (): void => ipcRenderer.send(IpcChannel.WindowMinimize),
    maximize: (): void => ipcRenderer.send(IpcChannel.WindowMaximize),
    close: (): void => ipcRenderer.send(IpcChannel.WindowClose)
  },
  auth: {
    login: (): Promise<MinecraftProfile> => ipcRenderer.invoke(IpcChannel.AuthLogin),
    logout: (): Promise<void> => ipcRenderer.invoke(IpcChannel.AuthLogout),
    getProfile: (): Promise<MinecraftProfile | null> =>
      ipcRenderer.invoke(IpcChannel.AuthGetProfile)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
