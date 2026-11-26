import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

/**
 * Fetches and caches authlib-injector (https://github.com/yushijinhun/authlib-injector),
 * the javaagent that points the game's skin lookups at our local Yggdrasil
 * server. The official feed publishes a sha256 for every build; a download
 * that does not match it is never used.
 */

const FEED_URL = 'https://authlib-injector.yushi.moe/artifact/latest.json'

interface FeedEntry {
  version: string
  download_url: string
  checksums: { sha256: string }
}

interface CachedInfo {
  version: string
  sha256: string
}

function cacheDir(): string {
  return join(app.getPath('userData'), 'authlib-injector')
}

const jarPath = (): string => join(cacheDir(), 'authlib-injector.jar')
const infoPath = (): string => join(cacheDir(), 'version.json')

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex')

async function readCached(): Promise<CachedInfo | null> {
  if (!existsSync(jarPath())) return null
  try {
    const info = JSON.parse(await readFile(infoPath(), 'utf8')) as CachedInfo
    // Guards against a truncated or tampered jar left from an earlier run.
    return sha256(await readFile(jarPath())) === info.sha256 ? info : null
  } catch {
    return null
  }
}

/** Checked once per launcher run; later launches reuse the answer. */
let resolved: Promise<string> | null = null

async function resolveJar(): Promise<string> {
  const cached = await readCached()
  let entry: FeedEntry
  try {
    const res = await fetch(FEED_URL)
    if (!res.ok) throw new Error(`feed returned ${res.status}`)
    entry = (await res.json()) as FeedEntry
  } catch (err) {
    // Offline: an already verified jar is good enough.
    if (cached !== null) return jarPath()
    throw new Error(
      `Could not download authlib-injector: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const expected = entry.checksums.sha256.toLowerCase()
  if (cached?.sha256 === expected) return jarPath()

  const res = await fetch(entry.download_url)
  if (!res.ok) {
    if (cached !== null) return jarPath()
    throw new Error(`Could not download authlib-injector (${res.status})`)
  }
  const jar = Buffer.from(await res.arrayBuffer())
  if (sha256(jar) !== expected) {
    if (cached !== null) return jarPath()
    throw new Error('authlib-injector download failed its checksum')
  }

  await mkdir(cacheDir(), { recursive: true })
  const tmp = `${jarPath()}.tmp`
  await writeFile(tmp, jar)
  await rename(tmp, jarPath())
  await writeFile(infoPath(), JSON.stringify({ version: entry.version, sha256: expected }))
  return jarPath()
}

export function ensureAuthlibInjector(): Promise<string> {
  if (resolved === null) {
    resolved = resolveJar().catch((err: unknown) => {
      // Let the next launch retry instead of caching the failure.
      resolved = null
      throw err
    })
  }
  return resolved
}
