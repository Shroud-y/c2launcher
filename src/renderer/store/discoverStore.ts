import { create } from 'zustand'
import { useModpackStore } from './modpackStore'
import type {
  ContentCategory,
  InstalledContent,
  ModLoader,
  SearchQuery,
  SearchResult
} from '@shared/types'

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
  /** Environment filter; null = show all (no side restriction). */
  environment: 'server' | 'client' | null

  results: SearchResult[]
  totalHits: number
  loading: boolean
  error: string | null

  /**
   * When set (via the + button on an instance), all content installs go
   * straight into this modpack — no instance picker popup.
   */
  installTarget: string | null
  /**
   * + flow only: restrict search results to content the target instance
   * can run (its game version, and loader for mods). On by default.
   */
  onlyAvailable: boolean

  /** projectId → install in flight. */
  installing: Record<string, boolean>
  /** projectId → installed during this session. */
  installed: Record<string, boolean>
  /** projectId → last install error. */
  installErrors: Record<string, string>
  /**
   * projectId → content already present in the locked install target
   * (current category only). Empty outside the + button flow or when
   * Modrinth hash resolution is unavailable (offline).
   */
  installedInTarget: Record<string, InstalledContent>

  setCategory: (category: ContentCategory) => void
  setText: (text: string) => void
  setSort: (sort: SearchQuery['sort']) => void
  setPageSize: (pageSize: number) => void
  setPage: (page: number) => void
  setGameVersion: (version: string | null) => void
  setLoader: (loader: ModLoader | null) => void
  setEnvironment: (environment: 'server' | 'client' | null) => void
  toggleTag: (tag: string) => void
  setInstallTarget: (modpackId: string | null) => void
  setOnlyAvailable: (onlyAvailable: boolean) => void

  search: () => Promise<void>
  /** Reloads `installedInTarget` from the locked instance's content folder. */
  refreshInstalledInTarget: () => Promise<void>
  installPack: (projectId: string, versionId?: string) => Promise<void>
  installContent: (
    projectId: string,
    modpackId: string,
    versionId?: string,
    replaceFileName?: string
  ) => Promise<void>
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
  environment: null,

  results: [],
  totalHits: 0,
  loading: false,
  error: null,

  installTarget: null,
  onlyAvailable: true,

  installing: {},
  installed: {},
  installErrors: {},
  installedInTarget: {},

  setInstallTarget: (installTarget): void =>
    set({ installTarget, installedInTarget: {}, onlyAvailable: true }),
  setOnlyAvailable: (onlyAvailable): void => set({ onlyAvailable, page: 1 }),

  setCategory: (category): void => set({ category, page: 1, tags: [] }),
  setText: (text): void => set({ text, page: 1 }),
  setSort: (sort): void => set({ sort, page: 1 }),
  setPageSize: (pageSize): void => set({ pageSize, page: 1 }),
  setPage: (page): void => set({ page }),
  setGameVersion: (gameVersion): void => set({ gameVersion, page: 1 }),
  setLoader: (loader): void => set({ loader, page: 1 }),
  setEnvironment: (environment): void => set({ environment, page: 1 }),
  toggleTag: (tag): void => {
    const tags = get().tags
    set({ tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag], page: 1 })
  },

  search: async (): Promise<void> => {
    const generation = ++searchGeneration
    const { category, text, sort, page, pageSize, tags, environment, installTarget, onlyAvailable } =
      get()

    let gameVersion = get().gameVersion ?? undefined
    let loader = get().loader ?? undefined
    // Locked to an instance: only show content that fits it (unless the
    // user unticks "Show only available"). The loader facet only makes
    // sense for mods — other content types carry pseudo-loaders
    // ("minecraft", "iris", "datapack").
    if (installTarget !== null && onlyAvailable && category !== 'modpacks') {
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
        tags: tags.length > 0 ? tags : undefined,
        environment: environment ?? undefined
      })
      if (generation !== searchGeneration) return
      set({ results: response.hits, totalHits: response.totalHits, loading: false })
    } catch (err) {
      if (generation !== searchGeneration) return
      const message = err instanceof Error ? stripIpcPrefix(err.message) : 'Search failed'
      set({ error: message, loading: false, results: [], totalHits: 0 })
    }
  },

  refreshInstalledInTarget: async (): Promise<void> => {
    const { installTarget, category } = get()
    if (installTarget === null || category === 'modpacks') {
      set({ installedInTarget: {} })
      return
    }
    try {
      const items = await window.api.modpack.content(installTarget, category)
      const map: Record<string, InstalledContent> = {}
      for (const item of items) {
        if (item.projectId !== null) map[item.projectId] = item
      }
      // Target or tab may have changed while listing — drop stale results.
      if (get().installTarget !== installTarget || get().category !== category) return
      // Files exist but none resolved to a project — hash lookup is down
      // (offline). Keep what we know instead of blanking the map.
      if (items.length > 0 && Object.keys(map).length === 0) return
      set({ installedInTarget: map })
    } catch {
      // Listing failed — keep the current map rather than flickering.
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

  installContent: async (projectId, modpackId, versionId, replaceFileName): Promise<void> => {
    const category = get().category
    if (category === 'modpacks') return
    set({
      installing: { ...get().installing, [projectId]: true },
      installErrors: { ...get().installErrors, [projectId]: '' }
    })
    try {
      // No `installed` flag here — the same mod can go into several instances.
      const item = await window.api.modpack.installContent({
        modpackId,
        projectId,
        source: 'modrinth',
        category,
        versionId,
        replaceFileName
      })
      // Optimistic: flip the + flow's "Installed" state right away (the
      // returned item has no versionNumber), then refresh in the background
      // so the versions tab learns which exact version is on disk.
      if (get().installTarget === modpackId && get().category === category) {
        set({
          installedInTarget: {
            ...get().installedInTarget,
            [projectId]: { ...item, projectId }
          }
        })
        void get().refreshInstalledInTarget()
      }
    } catch (err) {
      const message = err instanceof Error ? stripIpcPrefix(err.message) : 'Install failed'
      set({ installErrors: { ...get().installErrors, [projectId]: message } })
    } finally {
      const { [projectId]: _done, ...rest } = get().installing
      set({ installing: rest })
    }
  }
}))
