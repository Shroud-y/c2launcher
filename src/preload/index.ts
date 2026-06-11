import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type {
  AppSettings,
  CreateModpackParams,
  GameLogLine,
  GameState,
  InstalledMod,
  InstallModParams,
  InstallProgress,
  MinecraftProfile,
  Modpack,
  ModpackSettings,
  ProjectDetail,
  ProjectVersionInfo,
  SearchQuery,
  SearchResponse
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
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModpackStop, id),
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModpackOpenFolder, id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModpackDelete, id),
    installModrinthPack: (projectId: string): Promise<Modpack> =>
      ipcRenderer.invoke(IpcChannel.ModpackInstallModrinth, projectId),
    installMod: (params: InstallModParams): Promise<InstalledMod> =>
      ipcRenderer.invoke(IpcChannel.ModpackInstallMod, params),
    mods: (id: string): Promise<InstalledMod[]> => ipcRenderer.invoke(IpcChannel.ModpackMods, id),
    toggleMod: (id: string, fileName: string, enabled: boolean): Promise<InstalledMod> =>
      ipcRenderer.invoke(IpcChannel.ModpackToggleMod, id, fileName, enabled),
    removeMod: (id: string, fileName: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.ModpackRemoveMod, id, fileName),
    onInstallProgress: (cb: (p: InstallProgress) => void): (() => void) =>
      subscribe(IpcChannel.ModpackInstallProgress, cb),
    onGameState: (cb: (s: GameState) => void): (() => void) =>
      subscribe(IpcChannel.ModpackGameState, cb),
    onGameLog: (cb: (l: GameLogLine) => void): (() => void) =>
      subscribe(IpcChannel.ModpackGameLog, cb)
  },
  minecraft: {
    versions: (): Promise<string[]> => ipcRenderer.invoke(IpcChannel.MinecraftVersions)
  },
  discover: {
    search: (query: SearchQuery): Promise<SearchResponse> =>
      ipcRenderer.invoke(IpcChannel.DiscoverSearch, query),
    project: (projectId: string): Promise<ProjectDetail> =>
      ipcRenderer.invoke(IpcChannel.DiscoverProject, projectId),
    projectVersions: (projectId: string): Promise<ProjectVersionInfo[]> =>
      ipcRenderer.invoke(IpcChannel.DiscoverProjectVersions, projectId)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannel.SettingsGet),
    openDataDir: (): Promise<void> => ipcRenderer.invoke(IpcChannel.SettingsOpenDataDir)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
