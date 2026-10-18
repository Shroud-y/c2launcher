import type AdmZip from 'adm-zip'
import {
  curseforgeProvider,
  downloadCurseForgePack,
  parseManifestLoader,
  readCfManifest,
  resolvePackFiles
} from '../discover/curseforge'
import { downloadAll, type DownloadTask } from '../minecraft/install'
import {
  broadcastModpackState,
  extractOverrides,
  fetchIconDataUrl,
  safeJoin,
  type PackInstallReporter
} from './packCommon'
import { createModpack, deleteModpack, getModpack, instanceDirFor, updateModpack } from './store'
import type { ManualDownload, Modpack } from '@shared/types'

/**
 * Modpack install from CurseForge: read the zip's manifest.json, resolve
 * every listed file through the API, download them into the right
 * instance folders and unpack the overrides. Files whose authors forbid
 * launcher downloads are recorded on the pack as pendingDownloads for the
 * manual-download dialog instead of failing the install. Game/loader
 * files install later, on first launch.
 */

export function isCurseForgeZip(zip: AdmZip): boolean {
  return readCfManifest(zip) !== null
}

export async function installCurseForgePack(
  projectId: string,
  report: PackInstallReporter,
  versionId?: string
): Promise<Modpack> {
  const zip = await downloadCurseForgePack(projectId, versionId)
  return installCurseForgeZip(zip, report, projectId, null)
}

/**
 * Shared install core for API downloads and local imports. `projectId`
 * (when given) only fetches the listing icon; `fallbackName` names the
 * instance when the manifest carries no name.
 */
export async function installCurseForgeZip(
  zip: AdmZip,
  report: PackInstallReporter,
  projectId: string | null,
  fallbackName: string | null
): Promise<Modpack> {
  const manifest = readCfManifest(zip)
  if (manifest === null) throw new Error('Invalid CurseForge modpack: missing manifest.json')
  const { loader, loaderVersion } = parseManifestLoader(manifest)
  // Resolve before creating the instance, so an API failure leaves nothing behind.
  const files = await resolvePackFiles(manifest)

  const pack = await createModpack({
    name: manifest.name ?? fallbackName ?? 'CurseForge modpack',
    loader,
    gameVersion: manifest.minecraft.version,
    loaderVersion
  })
  await broadcastModpackState()
  report(pack, 0, 'Preparing files')
  const instanceDir = instanceDirFor(pack)

  try {
    if (projectId !== null) {
      report(pack, 3, 'Fetching icon')
      // Best-effort — a missing icon just leaves the default glyph.
      const project = await curseforgeProvider.getProject(projectId).catch(() => null)
      const icon = await fetchIconDataUrl(project?.iconUrl ?? null)
      if (icon !== null) {
        updateModpack(pack.id, { icon })
        await broadcastModpackState()
      }
    }

    report(pack, 5, 'Preparing files')
    const tasks: DownloadTask[] = []
    const pending: ManualDownload[] = []
    for (const file of files) {
      if (file.dir === null) continue // Worlds and other content we can't place.
      // Validates the API-supplied name as a single path segment.
      const dest = safeJoin(instanceDir, `${file.dir}/${file.fileName}`)
      if (file.url === null) {
        pending.push({
          name: file.name,
          fileName: file.fileName,
          dir: file.dir,
          sha1: file.sha1,
          size: file.size,
          pageUrl: file.pageUrl
        })
        continue
      }
      tasks.push({ url: file.url, dest, size: file.size, sha1: file.sha1 ?? undefined })
    }
    await downloadAll(tasks, (done, total) => {
      report(pack, 5 + (done / Math.max(total, 1)) * 85, `Files ${done}/${total}`)
    })

    report(pack, 92, 'Applying overrides')
    await extractOverrides(zip, instanceDir, [`${manifest.overrides}/`])

    if (pending.length > 0) {
      updateModpack(pack.id, { pendingDownloads: pending })
      await broadcastModpackState()
    }
    report(pack, 100, pending.length > 0 ? `${pending.length} file(s) need manual download` : 'Installed')
    return getModpack(pack.id) ?? pack
  } catch (err) {
    // Half-installed packs are useless — roll the record and folder back.
    await deleteModpack(pack.id).catch(() => undefined)
    throw err
  }
}
