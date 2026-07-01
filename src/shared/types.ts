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
  /** Custom icon as a data URL; absent/null renders the default glyph. */
  icon?: string | null
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
  /** Undefined leaves the loader unchanged. */
  loader?: ModLoader | null
  /** Undefined leaves it unchanged; null resolves the latest build at launch. */
  loaderVersion?: string | null
}

export interface AppSettings {
  /** App-data folder holding all launcher state (config, instances, game files). */
  dataDir: string
  /** False when the data folder is a user-chosen override of the default. */
  dataDirIsDefault: boolean
  /** Absolute path to a user-picked Java executable; null uses bundled/system Java. */
  javaPath: string | null
  /** Force the dedicated GPU for the game on hybrid-graphics machines. */
  preferDedicatedGpu: boolean
  /** Hide the launcher window to the system tray when a game launches. */
  minimizeToTrayOnLaunch: boolean
}

/** Streamed to the renderer while game data is copied to a new data folder. */
export interface DataMigrateProgress {
  /** Bytes copied so far across instances/ and minecraft/. */
  copiedBytes: number
  /** Total bytes to copy, known before copying starts. */
  totalBytes: number
  /** Path of the file being copied right now, relative to the source folder. */
  currentFile: string
}

/**
 * Outcome of a data-folder change (see SettingsChooseDataDir). A successful
 * move/copy/skip relaunches the app, so 'ok' never actually reaches the
 * renderer; 'canceled' means the user backed out and 'error' carries a
 * human-readable message to surface in the UI.
 */
export interface DataMigrateResult {
  status: 'ok' | 'canceled' | 'error'
  message?: string
}

export type InstallPhase =
  | 'manifest'
  | 'client'
  | 'libraries'
  | 'assets'
  | 'java'
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

/** Launcher self-update download progress, forwarded from electron-updater. */
export interface UpdateDownloadProgress {
  /** 0–100. */
  percent: number
  /** Current download speed in bytes per second. */
  bytesPerSecond: number
  /** Bytes downloaded so far. */
  transferred: number
  /** Total bytes to download. */
  total: number
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

export interface InstalledContent {
  /** Actual file name on disk, including a .disabled suffix when off. */
  fileName: string
  /** Display name — project title when known, else cleaned file name. */
  name: string
  enabled: boolean
  /** Version string resolved from Modrinth by file hash; null offline/unknown. */
  versionNumber: string | null
  /** Project icon resolved from Modrinth by file hash; null offline/unknown. */
  iconUrl: string | null
  /** Source project id resolved from Modrinth by file hash; null offline/unknown. */
  projectId: string | null
}

export interface InstallContentParams {
  modpackId: string
  projectId: string
  source: ContentSource
  /** What kind of content this is — decides the destination folder. */
  category: InstallableCategory
  /** Exact version to install; absent picks the best match for the pack. */
  versionId?: string
  /**
   * File of a previously installed version of the same project to delete
   * after the new file lands — used by the "Switch" version action.
   */
  replaceFileName?: string
}

/** A newer compatible version available for an installed content file. */
export interface ContentUpdate {
  /** File currently on disk (may carry the .disabled suffix). */
  fileName: string
  projectId: string
  /** Version to install when the user accepts the update. */
  versionId: string
  versionNumber: string
}

/** One entry in a Discover modpack's bundled content list (from its .mrpack). */
export interface ModpackContentEntry {
  /** Modrinth project id when the file is a CDN download; null for external URLs. */
  projectId: string | null
  /** Project title when resolved, else the archive file name. */
  name: string
  /** Modrinth project icon; null when unresolved or offline. */
  iconUrl: string | null
  /** Archive-relative file path (e.g. mods/sodium-x.y.z.jar). */
  fileName: string
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

/** Categories that install into an existing instance (everything but modpacks). */
export type InstallableCategory = Exclude<ContentCategory, 'modpacks'>

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
  /** Long description; markdown source, rendered as sanitized HTML. */
  body: string
  iconUrl: string | null
  downloads: number
  followers: number
  categories: string[]
  gameVersions: string[]
  loaders: string[]
  gallery: GalleryImage[]
}

export interface GalleryImage {
  url: string
  title: string | null
  description: string | null
  featured: boolean
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
