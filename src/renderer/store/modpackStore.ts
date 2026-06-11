import { create } from 'zustand'
import type {
  CreateModpackParams,
  GameStateKind,
  InstallProgress,
  Modpack,
  ModpackSettings
} from '@shared/types'

const LOG_CAP = 1000

interface ModpackState {
  modpacks: Modpack[]
  loaded: boolean
  /** Active install progress per modpack id; cleared on done/error. */
  installProgress: Record<string, InstallProgress>
  gameStates: Record<string, GameStateKind>
  logs: Record<string, string[]>
  launchError: string | null

  load: () => Promise<void>
  create: (params: CreateModpackParams) => Promise<Modpack>
  updateSettings: (id: string, settings: ModpackSettings) => Promise<void>
  /** Opens a file dialog (or clears) the instance icon. */
  setIcon: (id: string, clear: boolean) => Promise<void>
  launch: (id: string) => Promise<void>
  stop: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  startEventSubscriptions: () => void
}

function stripIpcPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

let subscribed = false

export const useModpackStore = create<ModpackState>((set, get) => ({
  modpacks: [],
  loaded: false,
  installProgress: {},
  gameStates: {},
  logs: {},
  launchError: null,

  load: async (): Promise<void> => {
    const modpacks = await window.api.modpack.list()
    set({ modpacks, loaded: true })
  },

  create: async (params): Promise<Modpack> => {
    const modpack = await window.api.modpack.create(params)
    set({ modpacks: [...get().modpacks, modpack] })
    return modpack
  },

  updateSettings: async (id, settings): Promise<void> => {
    const updated = await window.api.modpack.updateSettings(id, settings)
    if (updated !== null) {
      set({ modpacks: get().modpacks.map((m) => (m.id === id ? updated : m)) })
    }
  },

  setIcon: async (id, clear): Promise<void> => {
    const updated = await window.api.modpack.setIcon(id, clear)
    // Null means the file dialog was cancelled.
    if (updated !== null) {
      set({ modpacks: get().modpacks.map((m) => (m.id === id ? updated : m)) })
    }
  },

  launch: async (id): Promise<void> => {
    set({ launchError: null })
    try {
      await window.api.modpack.launch(id)
      // Refresh lastPlayedAt so the sidebar recents reorder.
      await get().load()
    } catch (err) {
      set({ launchError: err instanceof Error ? stripIpcPrefix(err.message) : 'Launch failed' })
    }
  },

  stop: async (id): Promise<void> => {
    await window.api.modpack.stop(id)
  },

  remove: async (id): Promise<void> => {
    await window.api.modpack.remove(id)
    set({ modpacks: get().modpacks.filter((m) => m.id !== id) })
  },

  startEventSubscriptions: (): void => {
    if (subscribed) return
    subscribed = true

    window.api.modpack.onInstallProgress((p) => {
      const progress = { ...get().installProgress }
      if (p.phase === 'done' || p.phase === 'error') {
        delete progress[p.modpackId]
      } else {
        progress[p.modpackId] = p
      }
      set({ installProgress: progress })
    })

    window.api.modpack.onGameState((s) => {
      const gameStates = { ...get().gameStates, [s.modpackId]: s.state }
      set({ gameStates })
    })

    window.api.modpack.onGameLog((l) => {
      const logs = { ...get().logs }
      const lines = [...(logs[l.modpackId] ?? []), l.line]
      logs[l.modpackId] = lines.length > LOG_CAP ? lines.slice(-LOG_CAP) : lines
      set({ logs })
    })
  }
}))
