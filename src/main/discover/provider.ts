import type { ModLoader, ProjectDetail, SearchQuery, SearchResponse } from '@shared/types'

/**
 * Shared shape for content sources (Modrinth now, CurseForge in Phase 5).
 * Version listing is provider-specific enough that only search and the
 * version query needed by installs are abstracted.
 */

export interface ProviderVersionFile {
  url: string
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
  getProjectVersions(projectId: string, filter?: VersionFilter): Promise<ProviderVersion[]>
}
