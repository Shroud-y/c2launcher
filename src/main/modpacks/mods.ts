import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { copyFile, mkdir, readdir, rename, rm, stat } from 'fs/promises'
import { basename, join } from 'path'
import {
  getLatestVersionsByHashes,
  getModrinthVersion,
  getProjectsByIds,
  getVersionsByHashes,
  modrinthProvider
} from '../discover/modrinth'
import type { VersionFilter } from '../discover/provider'
import { downloadFile } from '../minecraft/install'
import { getModpack, instanceDirFor } from './store'
import type {
  ContentUpdate,
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
    iconUrl: null,
    projectId: null
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
 * sha1 by path, memoized on size+mtime so a content folder is hashed once
 * rather than re-streamed by every listing/update check. Hashing whole
 * .jars off disk is the hot path here: a single modpack open used to hash
 * every file twice (enrich, then update check). The signature guard means
 * an edited/replaced file (different size or mtime) re-hashes automatically.
 */
const fileHashCache = new Map<string, { signature: string; hash: string }>()

export async function sha1OfFileCached(path: string): Promise<string> {
  const { size, mtimeMs } = await stat(path)
  const signature = `${size}:${mtimeMs}`
  const cached = fileHashCache.get(path)
  if (cached !== undefined && cached.signature === signature) return cached.hash
  const hash = await sha1OfFile(path)
  fileHashCache.set(path, { signature, hash })
  return hash
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
    const hashes = await Promise.all(items.map((i) => sha1OfFileCached(join(dir, i.fileName))))
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
        iconUrl: project?.iconUrl ?? null,
        projectId: match.projectId
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

/**
 * Copies user-picked files from disk into the instance's content folder
 * for the given category. Each name is validated against the category's
 * accepted extensions; a name that already exists gets a " (2)", " (3)"…
 * suffix so an import never silently overwrites an installed file.
 * Returns the freshly added entries (unenriched — the caller refreshes).
 */
export async function importContentFiles(
  modpackId: string,
  category: InstallableCategory,
  filePaths: string[]
): Promise<InstalledContent[]> {
  const dir = contentDir(modpackId, category)
  await mkdir(dir, { recursive: true })
  const existing = new Set(await readdir(dir).catch(() => []))

  const added: InstalledContent[] = []
  for (const source of filePaths) {
    const fileName = basename(source)
    assertSafeFileName(fileName, category)
    const target = uniqueName(fileName, existing)
    await copyFile(source, join(dir, target))
    existing.add(target)
    added.push(toInstalledContent(target))
  }
  return added
}

/** "mod.jar" → "mod (2).jar" when the name is already taken. */
function uniqueName(fileName: string, taken: Set<string>): string {
  if (!taken.has(fileName)) return fileName
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  let counter = 2
  let candidate = `${base} (${counter})${ext}`
  while (taken.has(candidate)) {
    counter += 1
    candidate = `${base} (${counter})${ext}`
  }
  return candidate
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

/**
 * Newer compatible versions for the instance's content files, resolved
 * through Modrinth's update endpoint by file hash. A file is up to date
 * when the latest compatible version ships the exact bytes already on
 * disk; files Modrinth doesn't recognize are skipped.
 */
export async function checkContentUpdates(
  modpackId: string,
  category: InstallableCategory
): Promise<ContentUpdate[]> {
  const pack = getModpack(modpackId)
  if (pack === null) throw new Error('Modpack not found')
  // Without a game version (or loader, for mods) "latest compatible"
  // is undefined — report nothing rather than suggest wrong files.
  if (pack.gameVersion === null) return []
  if (category === 'mods' && (pack.loader === null || pack.loader === 'vanilla')) return []

  const dir = contentDir(modpackId, category)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return [] // No folder yet.
  }
  const files = entries.filter((f) => matchesCategory(f, category))
  if (files.length === 0) return []

  const hashes = await Promise.all(files.map((f) => sha1OfFileCached(join(dir, f))))
  const latest = await getLatestVersionsByHashes(hashes, versionFilterFor(category, pack))

  const updates: ContentUpdate[] = []
  files.forEach((fileName, index) => {
    const version = latest.get(hashes[index])
    if (version === undefined) return
    if (version.files.some((f) => f.sha1 === hashes[index])) return // Already current.
    updates.push({
      fileName,
      projectId: version.projectId,
      versionId: version.id,
      versionNumber: version.versionNumber
    })
  })
  return updates
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
  // Switching versions: drop the old file once the new one is in place.
  if (params.replaceFileName !== undefined && params.replaceFileName !== file.filename) {
    assertSafeFileName(params.replaceFileName, params.category)
    await rm(join(instanceDirFor(pack), target.dir, params.replaceFileName), { force: true })
  }
  return toInstalledContent(file.filename)
}
