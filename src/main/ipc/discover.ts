import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type {
  ContentCategory,
  ContentSource,
  DiscoverCategory,
  ModpackContentEntry,
  ProjectDetail,
  ProjectVersionInfo,
  SearchQuery,
  SearchResponse
} from '@shared/types'
import { getCurseForgeCategories, isCurseForgeConfigured } from '../discover/curseforge'
import { getModpackContents } from '../discover/modrinth'
import { providerFor } from '../discover/providers'

const MAX_PAGE_SIZE = 100

export function registerDiscoverIpc(): void {
  ipcMain.handle(
    IpcChannel.DiscoverSearch,
    (_e, query: SearchQuery): Promise<SearchResponse> => {
      const sane: SearchQuery = {
        ...query,
        page: Math.max(1, Math.round(query.page)),
        pageSize: Math.max(1, Math.min(MAX_PAGE_SIZE, Math.round(query.pageSize)))
      }
      return providerFor(query.source).search(sane)
    }
  )

  ipcMain.handle(
    IpcChannel.DiscoverProject,
    (_e, source: ContentSource, projectId: string): Promise<ProjectDetail> =>
      providerFor(source).getProject(projectId)
  )

  ipcMain.handle(
    IpcChannel.DiscoverProjectVersions,
    async (_e, source: ContentSource, projectId: string): Promise<ProjectVersionInfo[]> => {
      const versions = await providerFor(source).getProjectVersions(projectId)
      return versions.map((v) => ({
        id: v.id,
        name: v.name,
        versionNumber: v.versionNumber,
        gameVersions: v.gameVersions,
        loaders: v.loaders,
        downloads: v.downloads,
        datePublished: v.datePublished
      }))
    }
  )

  ipcMain.handle(IpcChannel.DiscoverCurseforgeAvailable, (): boolean => isCurseForgeConfigured())

  ipcMain.handle(
    IpcChannel.DiscoverCurseforgeCategories,
    (_e, category: ContentCategory): Promise<DiscoverCategory[]> =>
      getCurseForgeCategories(category)
  )

  // Modrinth only — CurseForge modpack contents arrive with CF modpack installs.
  ipcMain.handle(
    IpcChannel.DiscoverModpackContents,
    (_e, projectId: string, versionId?: string): Promise<ModpackContentEntry[]> =>
      getModpackContents(projectId, versionId)
  )
}
