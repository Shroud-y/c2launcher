import { copyFile, mkdir, readdir, stat } from 'fs/promises'
import { isAbsolute, join, relative } from 'path'

/**
 * Pure filesystem helpers behind the data-folder migration (see
 * ipc/settings.ts). Kept free of electron imports so the copy/size/nesting
 * logic — the part that must never lose a user's game data — can be unit
 * tested on a real filesystem without spinning up Electron.
 */

/** Game-data folders that travel with a data-dir change; config jsons stay put. */
export const MIGRATE_DIRS = ['instances', 'minecraft'] as const

/** True when `child` is the same as, or nested inside, `parent`. */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** True when `dir` exists and holds at least one entry. */
export async function hasEntries(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length > 0
  } catch {
    return false
  }
}

/** Total size in bytes of every regular file under `dir` (0 when missing). */
export async function dirSize(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null)
  if (entries === null) return 0
  let total = 0
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) total += await dirSize(full)
    else if (entry.isFile()) total += (await stat(full)).size
  }
  return total
}

/**
 * Recursively copies `src` into `dst`, one file at a time, calling `onFile`
 * with each file's size once it lands. fs.cp would be shorter but offers no
 * per-file hook, and we need one to drive an honest progress bar.
 */
export async function copyTree(
  src: string,
  dst: string,
  onFile: (bytes: number, file: string) => void
): Promise<void> {
  await mkdir(dst, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = join(src, entry.name)
    const to = join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyTree(from, to, onFile)
    } else if (entry.isFile()) {
      const { size } = await stat(from)
      await copyFile(from, to)
      onFile(size, from)
    }
  }
}

/** Human-readable byte size for dialog/error text. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${i === 0 || n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}
