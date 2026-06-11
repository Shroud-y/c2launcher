import { create } from 'zustand'
import { useModpackStore } from './modpackStore'
import type { ContentCategory, ModLoader, SearchQuery, SearchResult } from '@shared/types'

function stripIpcPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

/** Ignore out-of-order responses: only the latest search may write results. */
let searchGeneration = 0

interface DiscoverState {
  category: ContentCategory
  text: string
  sort: SearchQuery['sort']
  page: number
  pageSize: number
  gameVersion: string | null
  loader: ModLoader | null
  tags: string[]

  results: SearchResult[]
  totalHits: number
  loading: boolean
  error: string | null

  /**
   * When set (via the + button on an instance), all content installs go
   * straight into this modpack — no instance picker popup.
   */
  installTarget: string | null

  /** projectId → install in flight. */
  installing: Record<string, boolean>
  /** projectId → installed during this session. */
  installed: Record<string, boolean>
  /** projectId → last install error. */
  installErrors: Record<string, string>

  setCategory: (category: ContentCategory) => void
  setText: (text: string) => void
  setSort: (sort: SearchQuery['sort']) => void
  setPageSize: (pageSize: number) => void
  setPage: (page: number) => void
  setGameVersion: (version: string | null) => void
  setLoader: (loader: ModLoader | null) => void
  toggleTag: (tag: string) => void
  setInstallTarget: (modpackId: string | null) => void

  search: () => Promise<void>
  installPack: (projectId: string, versionId?: string) => Promise<void>
  installContent: (projectId: string, modpackId: string, versionId?: string) => Promise<void>
}

export const useDiscoverStore = create<DiscoverState>((set, get) => ({
  category: 'modpacks',
  text: '',
  sort: 'relevance',
  page: 1,
  pageSize: 20,
  gameVersion: null,
  loader: null,
  tags: [],

  results: [],
  totalHits: 0,
  loading: false,
  error: null,

  installTarget: null,

  installing: {},
  installed: {},
  installErrors: {},

  setInstallTarget: (installTarget): void => set({ installTarget }),

  setCategory: (category): void => set({ category, page: 1, tags: [] }),
  setText: (text): void => set({ text, page: 1 }),
  setSort: (sort): void => set({ sort, page: 1 }),
  setPageSize: (pageSize): void => set({ pageSize, page: 1 }),
  setPage: (page): void => set({ page }),
  setGameVersion: (gameVersion): void => set({ gameVersion, page: 1 }),
  setLoader: (loader): void => set({ loader, page: 1 }),
  toggleTag: (tag): void => {
    const tags = get().tags
    set({ tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag], page: 1 })
  },

  search: async (): Promise<void> => {
    const generation = ++searchGeneration
    const { category, text, sort, page, pageSize, tags, installTarget } = get()

    let gameVersion = get().gameVersion ?? undefined
    let loader = get().loader ?? undefined
    // Locked to an instance: only show content that fits it. The loader
    // facet only makes sense for mods — other content types carry
    // pseudo-loaders ("minecraft", "iris", "datapack").
    if (installTarget !== null && category !== 'modpacks') {
      const pack = useModpackStore.getState().modpacks.find((m) => m.id === installTarget)
      if (pack !== undefined) {
        if (pack.gameVersion !== null) gameVersion = pack.gameVersion
        loader =
          category === 'mods' && pack.loader !== null && pack.loader !== 'vanilla'
            ? pack.loader
            : undefined
      }
    }

    set({ loading: true, error: null })
    try {
      const response = await window.api.discover.search({
        category,
        text,
        sort,
        page,
        pageSize,
        gameVersion,
        loader,
        tags: tags.length > 0 ? tags : undefined
      })
      if (generation !== searchGeneration) return
      set({ results: response.hits, totalHits: response.totalHits, loading: false })
    } catch (err) {
      if (generation !== searchGeneration) return
      const message = err instanceof Error ? stripIpcPrefix(err.message) : 'Search failed'
      set({ error: message, loading: false, results: [], totalHits: 0 })
    }
  },

  installPack: async (projectId, versionId): Promise<void> => {
    set({
      installing: { ...get().installing, [projectId]: true },
      installErrors: { ...get().installErrors, [projectId]: '' }
    })
    try {
      await window.api.modpack.installModrinthPack(projectId, versionId)
      await useModpackStore.getState().load()
      set({ installed: { ...get().installed, [projectId]: true } })
    } catch (err) {
      const message = err instanceof Error ? stripIpcPrefix(err.message) : 'Install failed'
      set({ installErrors: { ...get().installErrors, [projectId]: message } })
    } finally {
      const { [projectId]: _done, ...rest } = get().installing
      set({ installing: rest })
    }
  },

  installContent: async (projectId, modpackId, versionId): Promise<void> => {
    const category = get().category
    if (category === 'modpacks') return
    set({
      installing: { ...get().installing, [projectId]: true },
      installErrors: { ...get().installErrors, [projectId]: '' }
    })
    try {
      // No `installed` flag here — the same mod can go into several instances.
      await window.api.modpack.installContent({
        modpackId,
        projectId,
        source: 'modrinth',
        category,
        versionId
      })
    } catch (err) {
      const message = err instanceof Error ? stripIpcPrefix(err.message) : 'Install failed'
      set({ installErrors: { ...get().installErrors, [projectId]: message } })
    } finally {
      const { [projectId]: _done, ...rest } = get().installing
      set({ installing: rest })
    }
  }
}))
