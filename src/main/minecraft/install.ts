import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { findManifestVersion } from './manifest'
import { nativeArtifactFor, rulesAllow, type VersionMeta } from './versionMeta'

/**
 * Vanilla version installer: version json, client jar, libraries and
 * assets into the shared minecraft root. Every file is skipped when it
 * already exists with the right size, so re-runs are cheap.
 */

export interface InstallReporter {
  (phase: 'manifest' | 'client' | 'libraries' | 'assets' | 'done', percent: number, message: string): void
}

const DOWNLOAD_CONCURRENCY = 16

async function fileMatches(path: string, expectedSize?: number): Promise<boolean> {
  try {
    const s = await stat(path)
    return expectedSize === undefined || s.size === expectedSize
  } catch {
    return false
  }
}

export async function downloadFile(url: string, dest: string, expectedSha1?: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  const data = Buffer.from(await res.arrayBuffer())
  if (expectedSha1 !== undefined) {
    const actual = createHash('sha1').update(data).digest('hex')
    if (actual !== expectedSha1) throw new Error(`Checksum mismatch for ${url}`)
  }
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, data)
}

export interface DownloadTask {
  url: string
  dest: string
  size?: number
  sha1?: string
}

export async function downloadAll(
  tasks: DownloadTask[],
  onFile: (done: number, total: number) => void
): Promise<void> {
  let done = 0
  let nextIndex = 0
  let firstError: Error | null = null

  async function worker(): Promise<void> {
    while (firstError === null) {
      const index = nextIndex++
      if (index >= tasks.length) return
      const task = tasks[index]
      try {
        if (!(await fileMatches(task.dest, task.size))) {
          await downloadFile(task.url, task.dest, task.sha1)
        }
        done += 1
        onFile(done, tasks.length)
      } catch (err) {
        firstError = err instanceof Error ? err : new Error(String(err))
      }
    }
  }

  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, () => worker()))
  if (firstError !== null) throw firstError
}

export function versionJsonPath(root: string, versionId: string): string {
  return join(root, 'versions', versionId, `${versionId}.json`)
}

export function clientJarPath(root: string, versionId: string): string {
  return join(root, 'versions', versionId, `${versionId}.jar`)
}

export async function loadVersionMeta(root: string, versionId: string): Promise<VersionMeta> {
  const jsonPath = versionJsonPath(root, versionId)
  if (!(await fileMatches(jsonPath))) {
    const manifestEntry = await findManifestVersion(versionId)
    await downloadFile(manifestEntry.url, jsonPath, manifestEntry.sha1)
  }
  return JSON.parse(await readFile(jsonPath, 'utf-8')) as VersionMeta
}

interface AssetIndexJson {
  objects: Record<string, { hash: string; size: number }>
}

/**
 * Ensures the version is fully present locally. Percent split:
 * manifest 0–5, client 5–15, libraries 15–40, assets 40–100.
 */
export async function ensureVersionInstalled(
  root: string,
  versionId: string,
  report: InstallReporter
): Promise<VersionMeta> {
  report('manifest', 0, 'Fetching version metadata')
  const meta = await loadVersionMeta(root, versionId)
  report('manifest', 5, 'Version metadata ready')

  const jarPath = clientJarPath(root, versionId)
  if (!(await fileMatches(jarPath, meta.downloads.client.size))) {
    report('client', 5, 'Downloading game client')
    await downloadFile(meta.downloads.client.url, jarPath, meta.downloads.client.sha1)
  }
  report('client', 15, 'Game client ready')

  const libraryTasks: DownloadTask[] = []
  const nativeJars: string[] = []
  for (const lib of meta.libraries) {
    if (!rulesAllow(lib.rules)) continue
    const artifact = lib.downloads?.artifact
    if (artifact !== undefined) {
      libraryTasks.push({
        url: artifact.url,
        dest: join(root, 'libraries', ...artifact.path.split('/')),
        size: artifact.size,
        sha1: artifact.sha1
      })
    }
    // Pre-1.19 versions ship LWJGL natives as separate classifier jars
    // that must be downloaded and extracted next to the game.
    const native = nativeArtifactFor(lib)
    if (native !== null) {
      const dest = join(root, 'libraries', ...native.path.split('/'))
      libraryTasks.push({ url: native.url, dest, size: native.size, sha1: native.sha1 })
      nativeJars.push(dest)
    }
  }
  await downloadAll(libraryTasks, (done, total) => {
    report('libraries', 15 + (done / Math.max(total, 1)) * 23, `Libraries ${done}/${total}`)
  })

  if (nativeJars.length > 0) {
    report('libraries', 38, 'Extracting natives')
    const nativesDir = join(root, 'natives', versionId)
    await mkdir(nativesDir, { recursive: true })
    for (const jar of nativeJars) {
      const zip = new AdmZip(jar)
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || entry.entryName.startsWith('META-INF/')) continue
        zip.extractEntryTo(entry, nativesDir, false, true)
      }
    }
  }
  report('libraries', 40, 'Libraries ready')

  const indexPath = join(root, 'assets', 'indexes', `${meta.assetIndex.id}.json`)
  if (!(await fileMatches(indexPath))) {
    await downloadFile(meta.assetIndex.url, indexPath, meta.assetIndex.sha1)
  }
  const assetIndex = JSON.parse(await readFile(indexPath, 'utf-8')) as AssetIndexJson

  const assetTasks: DownloadTask[] = Object.values(assetIndex.objects).map((obj) => {
    const prefix = obj.hash.slice(0, 2)
    return {
      url: `https://resources.download.minecraft.net/${prefix}/${obj.hash}`,
      dest: join(root, 'assets', 'objects', prefix, obj.hash),
      // The filename IS the sha1 — size check is enough; hashing ~3k files is slow.
      size: obj.size
    }
  })
  await downloadAll(assetTasks, (done, total) => {
    if (done % 50 === 0 || done === total) {
      report('assets', 40 + (done / Math.max(total, 1)) * 60, `Assets ${done}/${total}`)
    }
  })

  report('done', 100, 'Installed')
  return meta
}
