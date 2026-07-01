import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc-channels'
import type {
  ModpackContentEntry,
  ProjectDetail,
  ProjectVersionInfo,
  SearchQuery,
  SearchResponse
} from '@shared/types'
import { getModpackContents, modrinthProvider } from '../discover/modrinth'

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
      return modrinthProvider.search(sane)
    }
  )

  ipcMain.handle(
    IpcChannel.DiscoverProject,
    (_e, projectId: string): Promise<ProjectDetail> => modrinthProvider.getProject(projectId)
  )

  ipcMain.handle(
    IpcChannel.DiscoverProjectVersions,
    async (_e, projectId: string): Promise<ProjectVersionInfo[]> => {
      const versions = await modrinthProvider.getProjectVersions(projectId)
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

  ipcMain.handle(
    IpcChannel.DiscoverModpackContents,
    (_e, projectId: string, versionId?: string): Promise<ModpackContentEntry[]> =>
      getModpackContents(projectId, versionId)
  )
}
