export type ModLoader = 'fabric' | 'forge' | 'quilt' | 'neoforge' | 'vanilla'

export type ContentSource = 'modrinth' | 'curseforge'

/** Visual tint of the card icon — newer/empty packs render lighter. */
export type IconTint = 'teal' | 'mint' | 'light'

export interface Modpack {
  id: string
  name: string
  loader: ModLoader | null
  gameVersion: string | null
  iconTint: IconTint
}

export interface InstalledMod {
  id: string
  name: string
  version: string
  enabled: boolean
}

export interface ModpackDetail extends Modpack {
  mods: InstalledMod[]
  memoryMb: number
  javaArgs: string
  updateAvailable: boolean
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
  loader: ModLoader | null
  gameVersion: string | null
  iconUrl: string | null
}
