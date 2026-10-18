import { app } from 'electron'
import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { sha1OfFileCached } from './mods'
import { broadcastModpackState, safeJoin } from './packCommon'
import { getModpack, instanceDirFor, updateModpack } from './store'
import type { ManualDownload, ManualPickResult } from '@shared/types'

/**
 * Files whose authors forbid launcher downloads (CurseForge
 * `allowModDistribution: false`). They live on the pack record as
 * `pendingDownloads`; the user downloads each one in a browser and the
 * launcher places it — either found in the Downloads folder (polled while
 * the dialog is open) or picked by hand. Files are recognized by sha1, so
 * a browser renaming "mod.jar" to "mod (1).jar" doesn't matter.
 */

/** Folders a pending file may land in — the record is ours, but stay strict. */
const ALLOWED_DIRS = new Set(['mods', 'resourcepacks', 'shaderpacks', 'datapacks'])
const POLL_MS = 2000
/** Browsers' in-progress download suffixes — never hash half-written files. */
const PARTIAL_SUFFIXES = ['.crdownload', '.part', '.partial', '.download', '.tmp']

function sameEntry(a: ManualDownload, b: ManualDownload): boolean {
  return a.dir === b.dir && a.fileName === b.fileName
}

function destinationOf(instanceDir: string, d: ManualDownload): string {
  if (!ALLOWED_DIRS.has(d.dir)) throw new Error(`Invalid content folder: ${d.dir}`)
  return safeJoin(instanceDir, `${d.dir}/${d.fileName}`)
}

/** Queues a file on the pack (no duplicates) and tells the renderer. */
export async function addPendingDownload(modpackId: string, d: ManualDownload): Promise<void> {
  const pack = getModpack(modpackId)
  if (pack === null) throw new Error('Modpack not found')
  destinationOf(instanceDirFor(pack), d) // Validate before storing.
  const pending = (pack.pendingDownloads ?? []).filter((p) => !sameEntry(p, d))
  updateModpack(modpackId, { pendingDownloads: [...pending, d] })
  await broadcastModpackState()
}

/** Drops a file from the list without placing it (user gave up on it). */
export async function skipPendingDownload(modpackId: string, fileName: string): Promise<void> {
  const pack = getModpack(modpackId)
  if (pack === null) throw new Error('Modpack not found')
  const pending = (pack.pendingDownloads ?? []).filter((p) => p.fileName !== fileName)
  updateModpack(modpackId, { pendingDownloads: pending })
  await broadcastModpackState()
}

/**
 * Pending entries a file on disk satisfies: same size, then same sha1.
 * Entries without a sha1 fall back to an exact file-name match.
 */
async function matchesFor(path: string, pending: ManualDownload[]): Promise<ManualDownload[]> {
  const { size, isFile } = await stat(path).then((s) => ({ size: s.size, isFile: s.isFile() }))
  if (!isFile) return []
  const bySize = pending.filter((p) => p.size === size)
  if (bySize.length === 0) return []
  const withHash = bySize.filter((p) => p.sha1 !== null)
  const hash = withHash.length > 0 ? await sha1OfFileCached(path) : null
  return bySize.filter((p) =>
    p.sha1 !== null ? p.sha1.toLowerCase() === hash : basename(path) === p.fileName
  )
}

/** Copies `source` into the instance for every matched entry and clears them. */
async function place(modpackId: string, source: string, matched: ManualDownload[]): Promise<void> {
  const pack = getModpack(modpackId)
  if (pack === null) return
  const instanceDir = instanceDirFor(pack)
  for (const d of matched) {
    const dest = destinationOf(instanceDir, d)
    await mkdir(dirname(dest), { recursive: true })
    // Copy, not move: the user's Downloads folder stays untouched.
    await copyFile(source, dest)
    // Version switch: the old file goes once the new one is in place.
    if (d.replaces !== undefined && d.replaces !== d.fileName) {
      await rm(destinationOf(instanceDir, { ...d, fileName: d.replaces }), { force: true })
    }
  }
  // Re-read: the list may have changed while we were copying.
  const fresh = getModpack(modpackId)
  if (fresh === null) return
  const remaining = (fresh.pendingDownloads ?? []).filter(
    (p) => !matched.some((m) => sameEntry(m, p))
  )
  updateModpack(modpackId, { pendingDownloads: remaining })
  await broadcastModpackState()
}

/** Places user-picked files; reports which ones matched nothing pending. */
export async function placePickedFiles(
  modpackId: string,
  paths: string[]
): Promise<ManualPickResult> {
  const result: ManualPickResult = { placed: 0, unmatched: [] }
  for (const path of paths) {
    const pending = getModpack(modpackId)?.pendingDownloads ?? []
    const matched = await matchesFor(path, pending)
    if (matched.length === 0) {
      result.unmatched.push(basename(path))
      continue
    }
    await place(modpackId, path, matched)
    result.placed += matched.length
  }
  return result
}

interface Watch {
  timer: NodeJS.Timeout
  scanning: boolean
}

const watches = new Map<string, Watch>()

async function scanDownloads(modpackId: string, watch: Watch): Promise<void> {
  if (watch.scanning) return
  watch.scanning = true
  try {
    const pending = getModpack(modpackId)?.pendingDownloads ?? []
    if (pending.length === 0) {
      setWatching(modpackId, false)
      return
    }
    const dir = app.getPath('downloads')
    const names = await readdir(dir).catch(() => [] as string[])
    for (const name of names) {
      if (PARTIAL_SUFFIXES.some((s) => name.toLowerCase().endsWith(s))) continue
      const path = join(dir, name)
      const current = getModpack(modpackId)?.pendingDownloads ?? []
      if (current.length === 0) break
      // A locked or vanished file is just retried on the next poll.
      const matched = await matchesFor(path, current).catch(() => [])
      if (matched.length > 0) await place(modpackId, path, matched).catch(() => undefined)
    }
  } finally {
    watch.scanning = false
  }
}

/**
 * Polls the Downloads folder for this pack's pending files while the
 * manual-download dialog is open. Stops by itself once nothing is pending
 * or the pack is gone.
 */
export function setWatching(modpackId: string, on: boolean): void {
  const existing = watches.get(modpackId)
  if (!on) {
    if (existing !== undefined) clearInterval(existing.timer)
    watches.delete(modpackId)
    return
  }
  if (existing !== undefined) return
  const watch: Watch = {
    timer: setInterval(() => void scanDownloads(modpackId, watch), POLL_MS),
    scanning: false
  }
  watch.timer.unref()
  watches.set(modpackId, watch)
  void scanDownloads(modpackId, watch)
}
