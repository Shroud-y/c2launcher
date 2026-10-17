import type { ModLoader, ProjectDetail, SearchQuery, SearchResponse } from '@shared/types'

/**
 * Shared shape for content sources (Modrinth, CurseForge). Search, project
 * detail and the version queries needed by installs are abstracted;
 * hash-based lookups (installed-file metadata, updates, export) stay
 * provider-specific.
 */

export interface ProviderVersionFile {
  /**
   * Direct download URL. Null when the author disallows third-party
   * downloads (CurseForge `allowModDistribution: false`) — the file must
   * then be fetched by hand from `manualUrl`.
   */
  url: string | null
  /** Web page to download the file by hand when `url` is null. */
  manualUrl?: string
  filename: string
  primary: boolean
  size: number
  sha1: string | null
}

export interface ProviderVersion {
  id: string
  projectId: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  downloads: number
  datePublished: string
  files: ProviderVersionFile[]
}

export interface VersionFilter {
  loaders?: ModLoader[]
  gameVersions?: string[]
}

export interface ContentProvider {
  search(query: SearchQuery): Promise<SearchResponse>
  getProject(projectId: string): Promise<ProjectDetail>
  /** Newest first. */
  getProjectVersions(projectId: string, filter?: VersionFilter): Promise<ProviderVersion[]>
  /** Single version lookup — used when the user picks an exact version. */
  getVersion(projectId: string, versionId: string): Promise<ProviderVersion>
}
