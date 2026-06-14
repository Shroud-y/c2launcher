import AdmZip from 'adm-zip'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getModrinthVersion, modrinthProvider } from '../discover/modrinth'
import { downloadAll, type DownloadTask } from '../minecraft/install'
import { createModpack, deleteModpack, instanceDirFor, updateModpack } from './store'
import type { ModLoader, Modpack } from '@shared/types'

/**
 * Fetches a project's Modrinth icon and returns it as a data URL so the
 * instance shows the same icon as the modpack listing. Best-effort:
 * returns null on any failure (offline, no icon, oversized).
 */
async function fetchIconDataUrl(iconUrl: string | null): Promise<string | null> {
  if (iconUrl === null || iconUrl === '') return null
  try {
    const res = await fetch(iconUrl)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    // Icons live inline in the registry JSON — keep them small.
    if (buffer.byteLength > 1024 * 1024) return null
    const type = res.headers.get('content-type') ?? 'image/png'
    return `data:${type};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Modpack install from Modrinth: download the .mrpack of the latest
 * version, create a local instance, fetch every listed file and unpack
 * the overrides. Game/loader files install later, on first launch.
 */

interface MrpackFile {
  path: string
  hashes: { sha1?: string; sha512?: string }
  env?: { client?: 'required' | 'optional' | 'unsupported' }
  downloads: string[]
  fileSize?: number
}

interface MrpackIndex {
  formatVersion: number
  game: string
  name: string
  dependencies: Record<string, string>
  files?: MrpackFile[]
}

const LOADER_DEPENDENCIES: [string, ModLoader][] = [
  ['fabric-loader', 'fabric'],
  ['quilt-loader', 'quilt'],
  ['forge', 'forge'],
  ['neoforge', 'neoforge']
]

/**
 * Joins an archive-relative path onto the instance dir, rejecting
 * anything that could escape it (.., absolute paths, drive letters).
 */
function safeJoin(rootDir: string, relPath: string): string {
  const parts = relPath.split(/[/\\]/)
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.includes(':'))) {
    throw new Error(`Unsafe path in modpack archive: ${relPath}`)
  }
  return join(rootDir, ...parts)
}

export interface PackInstallReporter {
  (pack: Modpack, percent: number, message: string): void
}

export async function installModrinthPack(
  projectId: string,
  report: PackInstallReporter,
  versionId?: string
): Promise<Modpack> {
  let versions
  if (versionId !== undefined) {
    const version = await getModrinthVersion(versionId)
    if (version.projectId !== projectId) {
      throw new Error('Version does not belong to this project')
    }
    versions = [version]
  } else {
    versions = await modrinthProvider.getProjectVersions(projectId)
  }
  const packFile = versions
    .flatMap((v) => v.files)
    .find((f) => f.filename.endsWith('.mrpack') && f.primary)
    ?? versions.flatMap((v) => v.files).find((f) => f.filename.endsWith('.mrpack'))
  if (packFile === undefined) {
    throw new Error('This project has no installable modpack file')
  }

  const res = await fetch(packFile.url)
  if (!res.ok) throw new Error(`Modpack download failed (${res.status})`)
  return installPackFromZip(new AdmZip(Buffer.from(await res.arrayBuffer())), report, projectId)
}

/**
 * Installs a modpack from a local .mrpack file already on disk. Same flow
 * as the Modrinth download path, minus the listing icon (there's no
 * project to fetch one from).
 */
export async function installMrpackFromFile(
  buffer: Buffer,
  report: PackInstallReporter
): Promise<Modpack> {
  let zip: AdmZip
  try {
    zip = new AdmZip(buffer)
  } catch {
    throw new Error('Not a valid .mrpack file')
  }
  return installPackFromZip(zip, report, null)
}

/**
 * Shared install core: parse the index, create the instance, download
 * every file and unpack overrides. `projectId` (when given) is used only
 * to fetch a matching listing icon.
 */
async function installPackFromZip(
  zip: AdmZip,
  report: PackInstallReporter,
  projectId: string | null
): Promise<Modpack> {
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (indexEntry === null) throw new Error('Invalid mrpack: missing modrinth.index.json')
  const index = JSON.parse(indexEntry.getData().toString('utf-8')) as MrpackIndex
  if (index.game !== 'minecraft' || index.formatVersion !== 1) {
    throw new Error('Unsupported modpack format')
  }

  const gameVersion = index.dependencies['minecraft']
  if (gameVersion === undefined) throw new Error('Modpack does not declare a Minecraft version')

  const loaderDep = LOADER_DEPENDENCIES.find(([dep]) => index.dependencies[dep] !== undefined)
  const loader: ModLoader = loaderDep?.[1] ?? 'vanilla'
  const loaderVersion = loaderDep !== undefined ? index.dependencies[loaderDep[0]] : null

  const pack = await createModpack({ name: index.name, loader, gameVersion, loaderVersion })
  const instanceDir = instanceDirFor(pack)

  try {
    if (projectId !== null) {
      report(pack, 3, 'Fetching icon')
      // Match the instance icon to the Modrinth listing. Best-effort —
      // a missing icon just leaves the default glyph.
      const project = await modrinthProvider.getProject(projectId).catch(() => null)
      const icon = await fetchIconDataUrl(project?.iconUrl ?? null)
      if (icon !== null) updateModpack(pack.id, { icon })
    }

    report(pack, 5, 'Preparing files')

    const tasks: DownloadTask[] = []
    for (const file of index.files ?? []) {
      if (file.env?.client === 'unsupported') continue
      const url = file.downloads[0]
      if (url === undefined) continue
      tasks.push({
        url,
        dest: safeJoin(instanceDir, file.path),
        size: file.fileSize,
        sha1: file.hashes.sha1
      })
    }
    await downloadAll(tasks, (done, total) => {
      report(pack, 5 + (done / Math.max(total, 1)) * 85, `Files ${done}/${total}`)
    })

    report(pack, 92, 'Applying overrides')
    // client-overrides comes second so it wins over shared overrides.
    for (const prefix of ['overrides/', 'client-overrides/']) {
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue
        const rel = entry.entryName.slice(prefix.length)
        if (rel === '') continue
        const dest = safeJoin(instanceDir, rel)
        await mkdir(dirname(dest), { recursive: true })
        await writeFile(dest, entry.getData())
      }
    }

    report(pack, 100, 'Installed')
    return pack
  } catch (err) {
    // Half-installed packs are useless — roll the record and folder back.
    await deleteModpack(pack.id).catch(() => undefined)
    throw err
  }
}
