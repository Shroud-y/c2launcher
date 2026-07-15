import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'
import { getVersionFilesByHashes, type HashFileMatch } from '../discover/modrinth'
import { resolveLoaderVersion } from '../minecraft/loader'
import { resolveForgeVersion } from '../minecraft/forge'
import { instanceDirFor } from './store'
import { sha1OfFileCached } from './mods'
import { LOADER_DEPENDENCIES } from './modrinthInstall'
import type { Modpack } from '@shared/types'

/**
 * Modpack export: packs the instance's standard content into a `.mrpack`
 * (Modrinth format — files Modrinth recognizes by hash become index
 * entries with download URLs, the rest go under overrides/) or a plain
 * instance `.zip` (round-trips through installInstanceZip). Saves, logs,
 * screenshots and caches are never included.
 */

/** Folders whose files can be hash-resolved to Modrinth downloads. */
const CONTENT_DIRS = ['mods', 'resourcepacks', 'shaderpacks', 'datapacks']
/** Folders always shipped as-is (overrides in an mrpack). */
const EXTRA_DIRS = ['config']

const INSTANCE_FILE = 'c2instance.json'

/** Recursively lists files under dir as instance-relative, /-separated paths. */
async function walkFiles(instanceDir: string, relDir: string): Promise<string[]> {
  const entries = await readdir(join(instanceDir, ...relDir.split('/')), {
    withFileTypes: true
  }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const rel = `${relDir}/${entry.name}`
    if (entry.isDirectory()) files.push(...(await walkFiles(instanceDir, rel)))
    else if (entry.isFile()) files.push(rel)
  }
  return files
}

function sha512OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

async function collectFiles(
  instanceDir: string
): Promise<{ content: string[]; extra: string[] }> {
  const content: string[] = []
  for (const dir of CONTENT_DIRS) content.push(...(await walkFiles(instanceDir, dir)))
  const extra: string[] = []
  for (const dir of EXTRA_DIRS) extra.push(...(await walkFiles(instanceDir, dir)))
  return { content, extra }
}

export async function exportModpack(pack: Modpack, filePath: string): Promise<void> {
  if (filePath.toLowerCase().endsWith('.zip')) {
    await exportInstanceZip(pack, filePath)
  } else {
    await exportMrpack(pack, filePath)
  }
}

/**
 * Plain instance zip: content + config folders and a fresh c2instance.json
 * (regenerated from the registry record so it never ships stale settings).
 */
async function exportInstanceZip(pack: Modpack, filePath: string): Promise<void> {
  const instanceDir = instanceDirFor(pack)
  const { content, extra } = await collectFiles(instanceDir)

  const zip = new AdmZip()
  for (const rel of [...content, ...extra]) {
    const slash = rel.lastIndexOf('/')
    zip.addLocalFile(join(instanceDir, ...rel.split('/')), rel.slice(0, slash), rel.slice(slash + 1))
  }
  zip.addFile(
    INSTANCE_FILE,
    Buffer.from(
      JSON.stringify(
        {
          loader: pack.loader,
          gameVersion: pack.gameVersion,
          loaderVersion: pack.loaderVersion ?? null,
          memoryMb: pack.memoryMb,
          javaArgs: pack.javaArgs
        },
        null,
        2
      )
    )
  )
  await zip.writeZipPromise(filePath)
}

/**
 * The loader dependency for modrinth.index.json. A pack without a pinned
 * loader build (empty = "latest at launch") gets the version resolved now,
 * so the index always carries a concrete one.
 */
async function loaderDependency(pack: Modpack): Promise<[string, string] | null> {
  const loader = pack.loader
  if (loader === null || loader === 'vanilla') return null
  const depKey = LOADER_DEPENDENCIES.find(([, l]) => l === loader)?.[0]
  if (depKey === undefined) return null

  let version = pack.loaderVersion ?? ''
  if (version === '') {
    try {
      version =
        loader === 'fabric' || loader === 'quilt'
          ? await resolveLoaderVersion(loader, pack.gameVersion ?? '')
          : await resolveForgeVersion(loader, pack.gameVersion ?? '')
    } catch {
      throw new Error(
        'Could not resolve the loader version — pin one in the modpack settings and retry'
      )
    }
  }
  return [depKey, version]
}

async function exportMrpack(pack: Modpack, filePath: string): Promise<void> {
  if (pack.gameVersion === null || pack.gameVersion === '') {
    throw new Error('Assign a game version to the modpack before exporting as .mrpack')
  }
  const instanceDir = instanceDirFor(pack)
  const { content, extra } = await collectFiles(instanceDir)

  const dependencies: Record<string, string> = { minecraft: pack.gameVersion }
  const loaderDep = await loaderDependency(pack)
  if (loaderDep !== null) dependencies[loaderDep[0]] = loaderDep[1]

  // Hash the content files and ask Modrinth which of them it can serve.
  // Disabled files are skipped here (the format has no disabled state) and
  // shipped under overrides/ instead, preserving the .disabled suffix.
  // Best-effort: offline, everything falls back to overrides.
  const linkable = content.filter((rel) => !rel.endsWith('.disabled'))
  const hashes = new Map<string, string>()
  for (const rel of linkable) {
    hashes.set(rel, await sha1OfFileCached(join(instanceDir, ...rel.split('/'))))
  }
  let matches = new Map<string, HashFileMatch>()
  try {
    matches = await getVersionFilesByHashes([...hashes.values()])
  } catch {
    // Offline or API failure — export everything as overrides.
  }

  const files: {
    path: string
    hashes: { sha1: string; sha512: string }
    downloads: string[]
    fileSize: number
  }[] = []
  const overrides: string[] = [...extra]
  for (const rel of content) {
    const sha1 = hashes.get(rel)
    const match = sha1 !== undefined ? matches.get(sha1) : undefined
    if (sha1 === undefined || match === undefined) {
      overrides.push(rel)
      continue
    }
    // The format requires both hashes; the local bytes are the remote file
    // (sha1 matched), so a locally computed sha512 fills any API gap.
    const sha512 = match.sha512 ?? (await sha512OfFile(join(instanceDir, ...rel.split('/'))))
    files.push({
      path: rel,
      hashes: { sha1, sha512 },
      downloads: [match.url],
      fileSize: match.size
    })
  }

  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name: pack.name,
    dependencies,
    files
  }

  const zip = new AdmZip()
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2)))
  for (const rel of overrides) {
    const slash = rel.lastIndexOf('/')
    zip.addLocalFile(
      join(instanceDir, ...rel.split('/')),
      `overrides/${rel.slice(0, slash)}`,
      rel.slice(slash + 1)
    )
  }
  await zip.writeZipPromise(filePath)
}
