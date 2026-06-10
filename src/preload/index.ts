import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type {
  CreateModpackParams,
  GameLogLine,
  GameState,
  InstallProgress,
  MinecraftProfile,
  Modpack,
  ModpackSettings
} from '@shared/types'

function subscribe<T>(channel: IpcChannel, callback: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

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
  },
  modpack: {
    list: (): Promise<Modpack[]> => ipcRenderer.invoke(IpcChannel.ModpackList),
    create: (params: CreateModpackParams): Promise<Modpack> =>
      ipcRenderer.invoke(IpcChannel.ModpackCreate, params),
    updateSettings: (id: string, settings: ModpackSettings): Promise<Modpack | null> =>
      ipcRenderer.invoke(IpcChannel.ModpackUpdateSettings, id, settings),
    launch: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModpackLaunch, id),
    onInstallProgress: (cb: (p: InstallProgress) => void): (() => void) =>
      subscribe(IpcChannel.ModpackInstallProgress, cb),
    onGameState: (cb: (s: GameState) => void): (() => void) =>
      subscribe(IpcChannel.ModpackGameState, cb),
    onGameLog: (cb: (l: GameLogLine) => void): (() => void) =>
      subscribe(IpcChannel.ModpackGameLog, cb)
  },
  minecraft: {
    versions: (): Promise<string[]> => ipcRenderer.invoke(IpcChannel.MinecraftVersions)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
