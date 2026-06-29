import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type {
  AppSettings,
  ContentUpdate,
  CreateModpackParams,
  DataMigrateProgress,
  DataMigrateResult,
  GameLogLine,
  GameState,
  InstallableCategory,
  InstalledContent,
  InstallContentParams,
  InstallProgress,
  MinecraftProfile,
  ModLoader,
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
    setIcon: (id: string, clear: boolean): Promise<Modpack | null> =>
      ipcRenderer.invoke(IpcChannel.ModpackSetIcon, id, clear),
    launch: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModpackLaunch, id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModpackStop, id),
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModpackOpenFolder, id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModpackDelete, id),
    installModrinthPack: (projectId: string, versionId?: string): Promise<Modpack> =>
      ipcRenderer.invoke(IpcChannel.ModpackInstallModrinth, projectId, versionId),
    importModpack: (): Promise<Modpack | null> =>
      ipcRenderer.invoke(IpcChannel.ModpackImportMrpack),
    installContent: (params: InstallContentParams): Promise<InstalledContent> =>
      ipcRenderer.invoke(IpcChannel.ModpackInstallMod, params),
    importContent: (id: string, category: InstallableCategory): Promise<InstalledContent[]> =>
      ipcRenderer.invoke(IpcChannel.ModpackImportContent, id, category),
    content: (id: string, category: InstallableCategory): Promise<InstalledContent[]> =>
      ipcRenderer.invoke(IpcChannel.ModpackMods, id, category),
    contentUpdates: (id: string, category: InstallableCategory): Promise<ContentUpdate[]> =>
      ipcRenderer.invoke(IpcChannel.ModpackContentUpdates, id, category),
    toggleContent: (
      id: string,
      category: InstallableCategory,
      fileName: string,
      enabled: boolean
    ): Promise<InstalledContent> =>
      ipcRenderer.invoke(IpcChannel.ModpackToggleMod, id, category, fileName, enabled),
    removeContent: (id: string, category: InstallableCategory, fileName: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.ModpackRemoveMod, id, category, fileName),
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
  loader: {
    check: (loader: ModLoader, gameVersion: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.LoaderCheck, loader, gameVersion),
    versions: (loader: ModLoader, gameVersion: string): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannel.LoaderVersions, loader, gameVersion)
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
    openDataDir: (): Promise<void> => ipcRenderer.invoke(IpcChannel.SettingsOpenDataDir),
    chooseJava: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannel.SettingsChooseJava),
    clearJava: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannel.SettingsClearJava),
    chooseDataDir: (): Promise<DataMigrateResult> =>
      ipcRenderer.invoke(IpcChannel.SettingsChooseDataDir),
    resetDataDir: (): Promise<void> => ipcRenderer.invoke(IpcChannel.SettingsResetDataDir),
    setGpuPref: (enabled: boolean): Promise<AppSettings> =>
      ipcRenderer.invoke(IpcChannel.SettingsSetGpuPref, enabled),
    setMinimizeToTray: (enabled: boolean): Promise<AppSettings> =>
      ipcRenderer.invoke(IpcChannel.SettingsSetMinimizeToTray, enabled),
    onDataMigrateProgress: (cb: (p: DataMigrateProgress) => void): (() => void) =>
      subscribe(IpcChannel.SettingsDataMigrateProgress, cb)
  },
  updater: {
    install: (): Promise<void> => ipcRenderer.invoke(IpcChannel.UpdateInstall),
    onAvailable: (cb: (info: { version: string }) => void): (() => void) =>
      subscribe(IpcChannel.UpdateAvailable, cb),
    onProgress: (cb: (info: { percent: number }) => void): (() => void) =>
      subscribe(IpcChannel.UpdateProgress, cb)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
