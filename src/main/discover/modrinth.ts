import { app } from 'electron'
import type {
  ContentCategory,
  ModLoader,
  ProjectDetail,
  SearchQuery,
  SearchResponse,
  SearchResult
} from '@shared/types'
import type {
  ContentProvider,
  ProviderVersion,
  VersionFilter
} from './provider'

/**
 * Modrinth API v2 client. Public read API, no key required, but a
 * descriptive User-Agent is mandatory per their usage policy. Search
 * responses are cached in memory for 5 minutes — Modrinth rate-limits
 * aggressively.
 */

const BASE_URL = 'https://api.modrinth.com/v2'
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_ENTRIES = 200

function userAgent(): string {
  return `Shroud-y/c2-launcher/${app.getVersion()}`
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': userAgent(),
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    }
  })
  if (!res.ok) {
    throw new Error(`Modrinth request failed (${res.status} ${res.statusText})`)
  }
  return (await res.json()) as T
}

interface TtlCache<T> {
  get(key: string): T | null
  set(key: string, value: T): void
}

function makeCache<T>(): TtlCache<T> {
  const entries = new Map<string, { expiresAt: number; value: T }>()
  return {
    get(key: string): T | null {
      const entry = entries.get(key)
      if (entry === undefined) return null
      if (Date.now() > entry.expiresAt) {
        entries.delete(key)
        return null
      }
      return entry.value
    },
    set(key: string, value: T): void {
      if (entries.size >= CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value })
    }
  }
}

const searchCache = makeCache<SearchResponse>()
const projectCache = makeCache<ProjectDetail>()

/**
 * Modrinth has no separate datapack project type — datapacks are mods
 * carrying the "datapack" loader category.
 */
const PROJECT_TYPE_FACETS: Record<ContentCategory, string[]> = {
  modpacks: ['project_type:modpack'],
  mods: ['project_type:mod'],
  resourcepacks: ['project_type:resourcepack'],
  datapacks: ['project_type:mod', 'categories:datapack'],
  shaders: ['project_type:shader']
}

const SORT_INDEX: Record<SearchQuery['sort'], string> = {
  relevance: 'relevance',
  downloads: 'downloads',
  newest: 'newest',
  updated: 'updated'
}

const KNOWN_LOADERS: ModLoader[] = ['fabric', 'forge', 'quilt', 'neoforge']

interface ModrinthSearchHit {
  project_id: string
  title: string
  description: string
  author: string
  downloads: number
  icon_url: string | null
  categories?: string[]
  display_categories?: string[]
  /** Supported game versions, oldest first. */
  versions: string[]
}

interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[]
  total_hits: number
}

function hitLoader(hit: ModrinthSearchHit): ModLoader | null {
  const categories = [...(hit.categories ?? []), ...(hit.display_categories ?? [])]
  return KNOWN_LOADERS.find((l) => categories.includes(l)) ?? null
}

function toSearchResult(hit: ModrinthSearchHit): SearchResult {
  return {
    id: hit.project_id,
    source: 'modrinth',
    name: hit.title,
    summary: hit.description,
    author: hit.author,
    downloads: hit.downloads,
    loader: hitLoader(hit),
    gameVersion: hit.versions.length > 0 ? hit.versions[hit.versions.length - 1] : null,
    iconUrl: hit.icon_url
  }
}

interface ModrinthVersionFile {
  url: string
  filename: string
  primary: boolean
  size: number
  hashes: { sha1?: string; sha512?: string }
}

export interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  downloads: number
  date_published: string
  files: ModrinthVersionFile[]
}

function toProviderVersion(v: ModrinthVersion): ProviderVersion {
  return {
    id: v.id,
    projectId: v.project_id,
    name: v.name,
    versionNumber: v.version_number,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    downloads: v.downloads,
    datePublished: v.date_published,
    files: v.files.map((f) => ({
      url: f.url,
      filename: f.filename,
      primary: f.primary,
      size: f.size,
      sha1: f.hashes.sha1 ?? null
    }))
  }
}

interface ModrinthProject {
  id: string
  title: string
  description: string
  body: string
  icon_url: string | null
  downloads: number
  followers: number
  categories?: string[]
  game_versions?: string[]
  loaders?: string[]
  gallery?: {
    url: string
    title: string | null
    description: string | null
    featured: boolean
    ordering?: number
  }[]
}

/** Single version lookup — used by the per-version download action. */
export async function getModrinthVersion(versionId: string): Promise<ProviderVersion> {
  const raw = await fetchJson<ModrinthVersion>(
    `${BASE_URL}/version/${encodeURIComponent(versionId)}`
  )
  return toProviderVersion(raw)
}

/** Local-file metadata resolved from a sha1 hash. */
export interface HashMatch {
  projectId: string
  versionNumber: string
}

export interface ProjectSummary {
  title: string
  iconUrl: string | null
}

// 'unknown' marks hashes Modrinth doesn't recognize, so unrecognized
// local files don't re-query on every listing.
const hashCache = makeCache<HashMatch | 'unknown'>()
const projectSummaryCache = makeCache<ProjectSummary>()

/** Batch hash → version lookup; unknown hashes are absent from the result. */
export async function getVersionsByHashes(hashes: string[]): Promise<Map<string, HashMatch>> {
  const result = new Map<string, HashMatch>()
  const missing: string[] = []
  for (const hash of hashes) {
    const cached = hashCache.get(hash)
    if (cached === null) missing.push(hash)
    else if (cached !== 'unknown') result.set(hash, cached)
  }
  if (missing.length === 0) return result

  const raw = await fetchJson<Record<string, ModrinthVersion>>(`${BASE_URL}/version_files`, {
    method: 'POST',
    body: JSON.stringify({ hashes: missing, algorithm: 'sha1' })
  })
  for (const hash of missing) {
    const version = raw[hash]
    if (version !== undefined) {
      const match: HashMatch = {
        projectId: version.project_id,
        versionNumber: version.version_number
      }
      hashCache.set(hash, match)
      result.set(hash, match)
    } else {
      hashCache.set(hash, 'unknown')
    }
  }
  return result
}

/**
 * Batch hash → latest compatible version lookup (Modrinth's update
 * endpoint). Hashes Modrinth doesn't recognize are absent from the
 * result. Not cached: this is the freshness check itself.
 */
export async function getLatestVersionsByHashes(
  hashes: string[],
  filter?: VersionFilter
): Promise<Map<string, ProviderVersion>> {
  if (hashes.length === 0) return new Map()
  const raw = await fetchJson<Record<string, ModrinthVersion>>(
    `${BASE_URL}/version_files/update`,
    {
      method: 'POST',
      body: JSON.stringify({
        hashes,
        algorithm: 'sha1',
        loaders: filter?.loaders ?? [],
        game_versions: filter?.gameVersions ?? []
      })
    }
  )
  const result = new Map<string, ProviderVersion>()
  for (const [hash, version] of Object.entries(raw)) {
    result.set(hash, toProviderVersion(version))
  }
  return result
}

/** Batch project lookup for titles and icons. */
export async function getProjectsByIds(ids: string[]): Promise<Map<string, ProjectSummary>> {
  const result = new Map<string, ProjectSummary>()
  const missing: string[] = []
  for (const id of ids) {
    const cached = projectSummaryCache.get(id)
    if (cached !== null) result.set(id, cached)
    else missing.push(id)
  }
  if (missing.length === 0) return result

  const raw = await fetchJson<ModrinthProject[]>(
    `${BASE_URL}/projects?ids=${encodeURIComponent(JSON.stringify(missing))}`
  )
  for (const project of raw) {
    const summary: ProjectSummary = { title: project.title, iconUrl: project.icon_url }
    projectSummaryCache.set(project.id, summary)
    result.set(project.id, summary)
  }
  return result
}

export const modrinthProvider: ContentProvider = {
  async search(query: SearchQuery): Promise<SearchResponse> {
    const cacheKey = JSON.stringify(query)
    const cached = searchCache.get(cacheKey)
    if (cached !== null) return cached

    const facets: string[][] = PROJECT_TYPE_FACETS[query.category].map((f) => [f])
    if (query.gameVersion !== undefined) facets.push([`versions:${query.gameVersion}`])
    // Loaders share the categories facet with tags on Modrinth.
    if (query.loader !== undefined) facets.push([`categories:${query.loader}`])
    for (const tag of query.tags ?? []) facets.push([`categories:${tag}`])

    const params = new URLSearchParams({
      query: query.text,
      index: SORT_INDEX[query.sort],
      offset: String((query.page - 1) * query.pageSize),
      limit: String(query.pageSize),
      facets: JSON.stringify(facets)
    })

    const raw = await fetchJson<ModrinthSearchResponse>(`${BASE_URL}/search?${params}`)
    const response: SearchResponse = {
      hits: raw.hits.map(toSearchResult),
      totalHits: raw.total_hits
    }
    searchCache.set(cacheKey, response)
    return response
  },

  async getProject(projectId: string): Promise<ProjectDetail> {
    const cached = projectCache.get(projectId)
    if (cached !== null) return cached

    const raw = await fetchJson<ModrinthProject>(
      `${BASE_URL}/project/${encodeURIComponent(projectId)}`
    )
    const detail: ProjectDetail = {
      id: raw.id,
      source: 'modrinth',
      name: raw.title,
      summary: raw.description,
      body: raw.body,
      iconUrl: raw.icon_url,
      downloads: raw.downloads,
      followers: raw.followers,
      categories: raw.categories ?? [],
      gameVersions: raw.game_versions ?? [],
      loaders: raw.loaders ?? [],
      // Featured first, then by Modrinth's ordering field.
      gallery: [...(raw.gallery ?? [])]
        .sort((a, b) => Number(b.featured) - Number(a.featured) || (a.ordering ?? 0) - (b.ordering ?? 0))
        .map((g) => ({
          url: g.url,
          title: g.title,
          description: g.description,
          featured: g.featured
        }))
    }
    projectCache.set(projectId, detail)
    return detail
  },

  async getProjectVersions(projectId: string, filter?: VersionFilter): Promise<ProviderVersion[]> {
    const params = new URLSearchParams()
    if (filter?.loaders !== undefined) params.set('loaders', JSON.stringify(filter.loaders))
    if (filter?.gameVersions !== undefined) {
      params.set('game_versions', JSON.stringify(filter.gameVersions))
    }
    const suffix = params.size > 0 ? `?${params}` : ''
    const raw = await fetchJson<ModrinthVersion[]>(
      `${BASE_URL}/project/${encodeURIComponent(projectId)}/version${suffix}`
    )
    return raw.map(toProviderVersion)
  }
}
