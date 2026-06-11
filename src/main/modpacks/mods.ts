import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { readdir, rename, rm } from 'fs/promises'
import { join } from 'path'
import {
  getModrinthVersion,
  getProjectsByIds,
  getVersionsByHashes,
  modrinthProvider
} from '../discover/modrinth'
import type { VersionFilter } from '../discover/provider'
import { downloadFile } from '../minecraft/install'
import { getModpack, instanceDirFor } from './store'
import type {
  InstallableCategory,
  InstallContentParams,
  InstalledContent,
  Modpack
} from '@shared/types'

/**
 * Content files inside the instance folder (mods, resourcepacks,
 * shaderpacks, datapacks). Disabling renames the file to
 * <name>.<ext>.disabled so the game skips it; no registry is kept —
 * the folder is the source of truth. Names, versions and icons are
 * resolved from Modrinth by file hash when online.
 */

const DISABLED_SUFFIX = '.disabled'

/** Destination folder and accepted file extensions per content kind. */
const CONTENT_TARGETS: Record<InstallableCategory, { dir: string; extensions: string[] }> = {
  mods: { dir: 'mods', extensions: ['.jar'] },
  resourcepacks: { dir: 'resourcepacks', extensions: ['.zip'] },
  shaders: { dir: 'shaderpacks', extensions: ['.zip'] },
  datapacks: { dir: 'datapacks', extensions: ['.zip'] }
}

function contentDir(modpackId: string, category: InstallableCategory): string {
  const pack = getModpack(modpackId)
  if (pack === null) throw new Error('Modpack not found')
  return join(instanceDirFor(pack), CONTENT_TARGETS[category].dir)
}

function matchesCategory(fileName: string, category: InstallableCategory): boolean {
  return CONTENT_TARGETS[category].extensions.some(
    (e) => fileName.endsWith(e) || fileName.endsWith(`${e}${DISABLED_SUFFIX}`)
  )
}

/** Rejects names that could navigate outside the content folder. */
function assertSafeFileName(fileName: string, category: InstallableCategory): void {
  if (fileName === '' || /[/\\]/.test(fileName) || fileName.includes('..')) {
    throw new Error(`Invalid file name: ${fileName}`)
  }
  if (!matchesCategory(fileName, category)) {
    throw new Error(`Unexpected file type: ${fileName}`)
  }
}

function toInstalledContent(fileName: string): InstalledContent {
  const enabled = !fileName.endsWith(DISABLED_SUFFIX)
  const base = enabled ? fileName : fileName.slice(0, -DISABLED_SUFFIX.length)
  return {
    fileName,
    name: base.replace(/\.(jar|zip)$/, ''),
    enabled,
    versionNumber: null,
    iconUrl: null
  }
}

function sha1OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/**
 * Fills name/version/icon from Modrinth by file hash. Best-effort:
 * any failure (offline, rate limit) leaves the plain file names.
 */
async function enrichFromModrinth(
  dir: string,
  items: InstalledContent[]
): Promise<InstalledContent[]> {
  try {
    const hashes = await Promise.all(items.map((i) => sha1OfFile(join(dir, i.fileName))))
    const versionByHash = await getVersionsByHashes(hashes)
    const projectIds = [...new Set([...versionByHash.values()].map((m) => m.projectId))]
    const projects = await getProjectsByIds(projectIds)

    return items.map((item, index) => {
      const match = versionByHash.get(hashes[index])
      if (match === undefined) return item
      const project = projects.get(match.projectId)
      return {
        ...item,
        name: project?.title ?? item.name,
        versionNumber: match.versionNumber,
        iconUrl: project?.iconUrl ?? null
      }
    })
  } catch {
    return items
  }
}

export async function listContent(
  modpackId: string,
  category: InstallableCategory
): Promise<InstalledContent[]> {
  const dir = contentDir(modpackId, category)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return [] // No folder yet.
  }
  const items = entries
    .filter((f) => matchesCategory(f, category))
    .map(toInstalledContent)
    .sort((a, b) => a.name.localeCompare(b.name))
  return enrichFromModrinth(dir, items)
}

export async function setContentEnabled(
  modpackId: string,
  category: InstallableCategory,
  fileName: string,
  enabled: boolean
): Promise<InstalledContent> {
  assertSafeFileName(fileName, category)
  const dir = contentDir(modpackId, category)
  const current = toInstalledContent(fileName)
  if (current.enabled === enabled) return current

  const newName = enabled
    ? fileName.slice(0, -DISABLED_SUFFIX.length)
    : `${fileName}${DISABLED_SUFFIX}`
  try {
    await rename(join(dir, fileName), join(dir, newName))
  } catch {
    throw new Error('Could not toggle the file — stop the game first')
  }
  return toInstalledContent(newName)
}

export async function removeContentFile(
  modpackId: string,
  category: InstallableCategory,
  fileName: string
): Promise<void> {
  assertSafeFileName(fileName, category)
  await rm(join(contentDir(modpackId, category), fileName), { force: true })
}

function versionFilterFor(category: InstallableCategory, pack: Modpack): VersionFilter {
  const gameVersions = pack.gameVersion !== null ? [pack.gameVersion] : undefined
  if (category === 'mods') {
    // pack.loader is validated non-null/non-vanilla before this is called.
    return { loaders: pack.loader !== null ? [pack.loader] : undefined, gameVersions }
  }
  // Resourcepacks/shaders/datapacks carry pseudo-loaders ("minecraft",
  // "iris", "datapack"…) — filtering by the pack's mod loader finds nothing.
  return { gameVersions }
}

export async function installContentFromModrinth(
  params: InstallContentParams
): Promise<InstalledContent> {
  if (params.source !== 'modrinth') {
    throw new Error('CurseForge installs arrive in a later phase')
  }
  const pack = getModpack(params.modpackId)
  if (pack === null) throw new Error('Modpack not found')
  if (params.category === 'mods' && (pack.loader === null || pack.loader === 'vanilla')) {
    throw new Error('This modpack has no mod loader — mods need Fabric, Forge or Quilt')
  }
  // Auto-picking needs a game version to filter by; an explicit version doesn't.
  if (pack.gameVersion === null && params.versionId === undefined) {
    throw new Error('Assign a game version to the modpack first')
  }

  const target = CONTENT_TARGETS[params.category]
  let versions
  if (params.versionId !== undefined) {
    // User picked an exact version — trust the choice, skip compatibility filters.
    const version = await getModrinthVersion(params.versionId)
    if (version.projectId !== params.projectId) {
      throw new Error('Version does not belong to this project')
    }
    versions = [version]
  } else {
    versions = await modrinthProvider.getProjectVersions(
      params.projectId,
      versionFilterFor(params.category, pack)
    )
  }
  const matchesExt = (name: string): boolean => target.extensions.some((e) => name.endsWith(e))
  const file = versions
    .flatMap((v) => v.files)
    .find((f) => f.primary && matchesExt(f.filename))
    ?? versions.flatMap((v) => v.files).find((f) => matchesExt(f.filename))
  if (file === undefined) {
    const wanted = params.category === 'mods' ? `${pack.loader} build` : 'compatible file'
    throw new Error(`No ${wanted} for Minecraft ${pack.gameVersion}`)
  }

  assertSafeFileName(file.filename, params.category)
  await downloadFile(
    file.url,
    join(instanceDirFor(pack), target.dir, file.filename),
    file.sha1 ?? undefined
  )
  return toInstalledContent(file.filename)
}
