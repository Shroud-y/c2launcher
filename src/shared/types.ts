export type ModLoader = 'fabric' | 'forge' | 'quilt' | 'neoforge' | 'vanilla'

export type ContentSource = 'modrinth' | 'curseforge'

/** Visual tint of the card icon — newer/empty packs render lighter. */
export type IconTint = 'teal' | 'mint' | 'light'

export interface Modpack {
  id: string
  name: string
  /** Folder name under <dataDir>/instances — derived from the name. */
  dirName: string
  loader: ModLoader | null
  gameVersion: string | null
  /** Pinned loader version (mrpack installs); null resolves latest at launch. */
  loaderVersion?: string | null
  iconTint: IconTint
  memoryMb: number
  javaArgs: string
  createdAt: number
  lastPlayedAt: number | null
}

export interface CreateModpackParams {
  name: string
  loader: ModLoader
  gameVersion: string
  /** Pinned loader version — set by mrpack installs, absent for manual packs. */
  loaderVersion?: string | null
}

export interface ModpackSettings {
  name: string
  memoryMb: number
  javaArgs: string
  /** Null keeps the current version (or stays unassigned). */
  gameVersion: string | null
}

export interface AppSettings {
  /** App-data folder holding all launcher state (config, instances, game files). */
  dataDir: string
}

export type InstallPhase =
  | 'manifest'
  | 'client'
  | 'libraries'
  | 'assets'
  | 'pack'
  | 'loader'
  | 'done'
  | 'error'

export interface InstallProgress {
  modpackId: string
  phase: InstallPhase
  /** 0–100 across the whole install. */
  percent: number
  message: string
}

export type GameStateKind = 'launching' | 'running' | 'exited' | 'error'

export interface GameState {
  modpackId: string
  state: GameStateKind
  exitCode?: number
  message?: string
}

export interface GameLogLine {
  modpackId: string
  stream: 'stdout' | 'stderr' | 'system'
  line: string
}

export interface InstalledMod {
  /** Actual file name on disk, including a .disabled suffix when off. */
  fileName: string
  /** Display name — file name without .jar / .disabled suffixes. */
  name: string
  enabled: boolean
}

export interface InstallModParams {
  modpackId: string
  projectId: string
  source: ContentSource
}

export interface MinecraftProfile {
  uuid: string
  username: string
  /** Raw 64×64 skin texture as base64 PNG; null when the fetch failed. */
  skinBase64: string | null
}

export type ContentCategory =
  | 'modpacks'
  | 'mods'
  | 'resourcepacks'
  | 'datapacks'
  | 'shaders'

export interface SearchQuery {
  category: ContentCategory
  text: string
  sort: 'relevance' | 'downloads' | 'newest' | 'updated'
  page: number
  pageSize: number
  gameVersion?: string
  loader?: ModLoader
  tags?: string[]
}

export interface SearchResult {
  id: string
  source: ContentSource
  name: string
  summary: string
  author: string
  downloads: number
  loader: ModLoader | null
  gameVersion: string | null
  iconUrl: string | null
}

export interface SearchResponse {
  hits: SearchResult[]
  totalHits: number
}

export interface ProjectDetail {
  id: string
  source: ContentSource
  name: string
  summary: string
  /** Long description; markdown source, rendered as cleaned plain text. */
  body: string
  iconUrl: string | null
  downloads: number
  followers: number
  categories: string[]
  gameVersions: string[]
  loaders: string[]
}

export interface ProjectVersionInfo {
  id: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  downloads: number
  datePublished: string
}
