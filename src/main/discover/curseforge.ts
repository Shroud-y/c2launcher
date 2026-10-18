import { app } from 'electron'
import type {
  ContentCategory,
  DiscoverCategory,
  ModLoader,
  ProjectDetail,
  SearchQuery,
  SearchResponse,
  SearchResult
} from '@shared/types'
import type { ContentProvider, ProviderVersion, VersionFilter } from './provider'
import { makeCache } from './cache'

/**
 * CurseForge Core API v1 client. Every request needs the launcher's API
 * key, inlined at build time from CURSEFORGE_API_KEY (.env.local, never
 * committed; see electron.vite.config.ts). A build without the key keeps CurseForge
 * disabled instead of failing at startup.
 *
 * All traffic goes through cfFetch() — swapping the direct API for a
 * key-holding proxy later means changing only CF_BASE_URL and its headers.
 */

const CF_BASE_URL = 'https://api.curseforge.com/v1'
const API_KEY = __CURSEFORGE_API_KEY__

/** CurseForge game id for Minecraft. */
const MINECRAFT_GAME_ID = 432
/** API hard limit: index + pageSize must stay ≤ 10 000. */
const MAX_RESULT_WINDOW = 10_000
/** API hard limit on pageSize. */
const MAX_PAGE_SIZE = 50
/** Cap on files listed per project — big mods publish thousands. */
const MAX_FILES = 1000
const FILE_PAGE_CONCURRENCY = 5

export function isCurseForgeConfigured(): boolean {
  return API_KEY !== ''
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isCurseForgeConfigured()) {
    throw new Error('CurseForge is not available in this build (no API key)')
  }
  const res = await fetch(`${CF_BASE_URL}${path}`, {
    ...init,
    headers: {
      'x-api-key': API_KEY,
      Accept: 'application/json',
      'User-Agent': `Shroud-y/c2-launcher/${app.getVersion()}`,
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    }
  })
  if (res.status === 403) throw new Error('CurseForge rejected the API key (403)')
  if (!res.ok) {
    throw new Error(`CurseForge request failed (${res.status} ${res.statusText})`)
  }
  return (await res.json()) as T
}

/** Content type → CurseForge class id. */
const CLASS_IDS: Record<ContentCategory, number> = {
  mods: 6,
  modpacks: 4471,
  resourcepacks: 12,
  shaders: 6552,
  datapacks: 6945
}

const SORT_FIELDS: Record<SearchQuery['sort'], number> = {
  relevance: 2, // Popularity — the API has no text-relevance sort.
  downloads: 6, // TotalDownloads
  newest: 11, // ReleasedDate
  updated: 3 // LastUpdated
}

/** CurseForge ModLoaderType ↔ our loaders (2/3 = Cauldron/LiteLoader, unused). */
const LOADER_TYPES: Record<Exclude<ModLoader, 'vanilla'>, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
}

function loaderFromType(type: number | null | undefined): ModLoader | null {
  const entry = Object.entries(LOADER_TYPES).find(([, t]) => t === type)
  return entry !== undefined ? (entry[0] as ModLoader) : null
}

const LOADER_NAMES = new Set(Object.keys(LOADER_TYPES))

interface CfPagination {
  index: number
  pageSize: number
  resultCount: number
  totalCount: number
}

interface CfResponse<T> {
  data: T
}

interface CfPaged<T> {
  data: T[]
  pagination: CfPagination
}

interface CfCategory {
  id: number
  name: string
  iconUrl: string | null
  classId?: number
  parentCategoryId?: number
}

interface CfFileIndex {
  gameVersion: string
  fileId: number
  modLoader?: number | null
}

interface CfMod {
  id: number
  name: string
  summary: string
  downloadCount: number
  thumbsUpCount?: number
  classId?: number
  allowModDistribution?: boolean | null
  links?: { websiteUrl?: string | null }
  logo?: { url?: string | null; thumbnailUrl?: string | null } | null
  authors?: { name: string }[]
  categories?: CfCategory[]
  screenshots?: { title?: string | null; description?: string | null; url: string }[]
  latestFilesIndexes?: CfFileIndex[]
}

interface CfFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  fileDate: string
  fileLength: number
  downloadCount: number
  downloadUrl: string | null
  /** Mixes game versions with loader ("Forge") and side ("Client") tags. */
  gameVersions: string[]
  /** algo 1 = sha1, 2 = md5. */
  hashes?: { value: string; algo: number }[]
}

const searchCache = makeCache<SearchResponse>()
const modCache = makeCache<CfMod>()
const projectCache = makeCache<ProjectDetail>()
const filesCache = makeCache<CfFile[]>()
const categoriesCache = makeCache<DiscoverCategory[]>()

function releaseKey(version: string): number[] | null {
  const parts = version.split('.').map(Number)
  return parts.every((n) => Number.isInteger(n) && n >= 0) ? parts : null
}

/** Newest release version of the list, ignoring snapshots; null when none. */
function newestGameVersion(versions: string[]): string | null {
  let best: string | null = null
  let bestKey: number[] | null = null
  for (const v of versions) {
    const key = releaseKey(v)
    if (key === null) continue
    if (bestKey === null || compareKeys(key, bestKey) > 0) {
      best = v
      bestKey = key
    }
  }
  return best
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function iconOf(mod: CfMod): string | null {
  return mod.logo?.thumbnailUrl || mod.logo?.url || null
}

function toSearchResult(mod: CfMod): SearchResult {
  const indexes = mod.latestFilesIndexes ?? []
  return {
    id: String(mod.id),
    source: 'curseforge',
    name: mod.name,
    summary: mod.summary,
    author: mod.authors?.[0]?.name ?? 'Unknown',
    downloads: mod.downloadCount,
    loader: indexes.map((i) => loaderFromType(i.modLoader)).find((l) => l !== null) ?? null,
    gameVersion: newestGameVersion(indexes.map((i) => i.gameVersion)),
    iconUrl: iconOf(mod)
  }
}

/** Splits CurseForge's mixed gameVersions tags into loaders and game versions. */
function splitFileTags(tags: string[]): { loaders: string[]; gameVersions: string[] } {
  const loaders: string[] = []
  const gameVersions: string[] = []
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (LOADER_NAMES.has(lower)) loaders.push(lower)
    else if (/^\d/.test(tag)) gameVersions.push(tag)
  }
  return { loaders, gameVersions }
}

function toProviderVersion(file: CfFile, mod: CfMod | null): ProviderVersion {
  const { loaders, gameVersions } = splitFileTags(file.gameVersions)
  const websiteUrl = mod?.links?.websiteUrl
  return {
    id: String(file.id),
    projectId: String(file.modId),
    name: file.displayName,
    versionNumber: file.displayName,
    gameVersions,
    loaders,
    downloads: file.downloadCount,
    datePublished: file.fileDate,
    files: [
      {
        url: file.downloadUrl,
        manualUrl:
          websiteUrl !== undefined && websiteUrl !== null
            ? `${websiteUrl}/files/${file.id}`
            : undefined,
        filename: file.fileName,
        primary: true,
        size: file.fileLength,
        sha1: file.hashes?.find((h) => h.algo === 1)?.value ?? null
      }
    ]
  }
}

/** Rejects anything but a plain numeric id before it reaches a URL path. */
function cfId(id: string): string {
  if (!/^\d+$/.test(id)) throw new Error(`Invalid CurseForge id: ${id}`)
  return id
}

async function getMod(modId: string): Promise<CfMod> {
  const cached = modCache.get(modId)
  if (cached !== null) return cached
  const raw = await cfFetch<CfResponse<CfMod>>(`/mods/${cfId(modId)}`)
  modCache.set(modId, raw.data)
  return raw.data
}

/**
 * Every file of a project matching the filter, newest first. The files
 * endpoint pages at 50, so the first page tells the total and the rest
 * are fetched a few at a time, capped at MAX_FILES.
 */
async function getFiles(modId: string, filter?: VersionFilter): Promise<CfFile[]> {
  const params = new URLSearchParams()
  const gameVersion = filter?.gameVersions?.[0]
  if (gameVersion !== undefined) params.set('gameVersion', gameVersion)
  const loader = filter?.loaders?.[0]
  if (loader !== undefined && loader !== 'vanilla') {
    params.set('modLoaderType', String(LOADER_TYPES[loader]))
  }
  const cacheKey = `${modId}?${params}`
  const cached = filesCache.get(cacheKey)
  if (cached !== null) return cached

  const page = (index: number): Promise<CfPaged<CfFile>> => {
    const query = new URLSearchParams(params)
    query.set('index', String(index))
    query.set('pageSize', String(MAX_PAGE_SIZE))
    return cfFetch<CfPaged<CfFile>>(`/mods/${cfId(modId)}/files?${query}`)
  }

  const first = await page(0)
  const files = [...first.data]
  const total = Math.min(first.pagination.totalCount, MAX_FILES)
  const indexes: number[] = []
  for (let i = MAX_PAGE_SIZE; i < total; i += MAX_PAGE_SIZE) indexes.push(i)
  for (let i = 0; i < indexes.length; i += FILE_PAGE_CONCURRENCY) {
    const batch = await Promise.all(indexes.slice(i, i + FILE_PAGE_CONCURRENCY).map(page))
    for (const res of batch) files.push(...res.data)
  }

  files.sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate))
  filesCache.set(cacheKey, files)
  return files
}

/** Top-level search categories for a content type. */
export async function getCurseForgeCategories(
  category: ContentCategory
): Promise<DiscoverCategory[]> {
  const classId = CLASS_IDS[category]
  const cacheKey = String(classId)
  const cached = categoriesCache.get(cacheKey)
  if (cached !== null) return cached

  const raw = await cfFetch<CfResponse<CfCategory[]>>(
    `/categories?gameId=${MINECRAFT_GAME_ID}&classId=${classId}`
  )
  const result = raw.data
    // Only direct children of the class — nested sub-categories would
    // bloat the sidebar.
    .filter((c) => c.parentCategoryId === classId)
    .map((c) => ({ id: String(c.id), name: c.name, iconUrl: c.iconUrl || null }))
    .sort((a, b) => a.name.localeCompare(b.name))
  categoriesCache.set(cacheKey, result)
  return result
}

export const curseforgeProvider: ContentProvider = {
  async search(query: SearchQuery): Promise<SearchResponse> {
    const cacheKey = JSON.stringify(query)
    const cached = searchCache.get(cacheKey)
    if (cached !== null) return cached

    const pageSize = Math.min(query.pageSize, MAX_PAGE_SIZE)
    const index = (query.page - 1) * pageSize
    if (index + pageSize > MAX_RESULT_WINDOW) return { hits: [], totalHits: MAX_RESULT_WINDOW }

    const params = new URLSearchParams({
      gameId: String(MINECRAFT_GAME_ID),
      classId: String(CLASS_IDS[query.category]),
      searchFilter: query.text,
      sortField: String(SORT_FIELDS[query.sort]),
      sortOrder: 'desc',
      index: String(index),
      pageSize: String(pageSize)
    })
    if (query.gameVersion !== undefined) params.set('gameVersion', query.gameVersion)
    if (query.loader !== undefined && query.loader !== 'vanilla') {
      params.set('modLoaderType', String(LOADER_TYPES[query.loader]))
    }
    // The API caps categoryIds at 10; numeric ids only.
    const categoryIds = (query.tags ?? []).filter((t) => /^\d+$/.test(t)).slice(0, 10)
    if (categoryIds.length > 0) params.set('categoryIds', `[${categoryIds.join(',')}]`)
    // No environment (client/server) facet on CurseForge — ignored.

    const raw = await cfFetch<CfPaged<CfMod>>(`/mods/search?${params}`)
    const response: SearchResponse = {
      hits: raw.data.map(toSearchResult),
      // Pages past the API's result window can't be fetched — don't offer them.
      totalHits: Math.min(raw.pagination.totalCount, MAX_RESULT_WINDOW)
    }
    searchCache.set(cacheKey, response)
    return response
  },

  async getProject(projectId: string): Promise<ProjectDetail> {
    const cached = projectCache.get(projectId)
    if (cached !== null) return cached

    const [mod, description] = await Promise.all([
      getMod(projectId),
      cfFetch<CfResponse<string>>(`/mods/${cfId(projectId)}/description`)
    ])
    const indexes = mod.latestFilesIndexes ?? []
    const loaders = new Set<string>()
    for (const i of indexes) {
      const loader = loaderFromType(i.modLoader)
      if (loader !== null) loaders.add(loader)
    }
    const detail: ProjectDetail = {
      id: String(mod.id),
      source: 'curseforge',
      name: mod.name,
      summary: mod.summary,
      body: description.data,
      bodyFormat: 'html',
      iconUrl: iconOf(mod),
      downloads: mod.downloadCount,
      followers: mod.thumbsUpCount ?? 0,
      categories: (mod.categories ?? []).map((c) => c.name),
      gameVersions: [...new Set(indexes.map((i) => i.gameVersion))],
      loaders: [...loaders],
      gallery: (mod.screenshots ?? []).map((s) => ({
        url: s.url,
        title: s.title || null,
        description: s.description || null,
        featured: false
      }))
    }
    projectCache.set(projectId, detail)
    return detail
  },

  async getProjectVersions(projectId: string, filter?: VersionFilter): Promise<ProviderVersion[]> {
    const [mod, files] = await Promise.all([getMod(projectId), getFiles(projectId, filter)])
    return files.map((f) => toProviderVersion(f, mod))
  },

  async getVersion(projectId: string, versionId: string): Promise<ProviderVersion> {
    const [mod, file] = await Promise.all([
      getMod(projectId),
      cfFetch<CfResponse<CfFile>>(`/mods/${cfId(projectId)}/files/${cfId(versionId)}`)
    ])
    return toProviderVersion(file.data, mod)
  }
}
