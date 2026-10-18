import type AdmZip from 'adm-zip'
import { BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { IpcChannel } from '@shared/ipc-channels'
import { adoptUnknownInstances, listModpacks } from './store'
import type { Modpack } from '@shared/types'

/** Helpers shared by the Modrinth (.mrpack) and CurseForge (manifest.json) pack installers. */

export interface PackInstallReporter {
  (pack: Modpack, percent: number, message: string): void
}

/**
 * Fetches a project's listing icon and returns it as a data URL so the
 * instance shows the same icon as the modpack listing. Best-effort:
 * returns null on any failure (offline, no icon, oversized).
 */
export async function fetchIconDataUrl(iconUrl: string | null): Promise<string | null> {
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
 * Joins an archive-relative path onto the instance dir, rejecting
 * anything that could escape it (.., absolute paths, drive letters).
 */
export function safeJoin(rootDir: string, relPath: string): string {
  const parts = relPath.split(/[/\\]/)
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.includes(':'))) {
    throw new Error(`Unsafe path in modpack archive: ${relPath}`)
  }
  return join(rootDir, ...parts)
}

export async function broadcastModpackState(): Promise<void> {
  await adoptUnknownInstances()
  const modpacks = listModpacks()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannel.ModpackStateChanged, modpacks)
  }
}

/**
 * Unpacks every file under the given archive folders (e.g. "overrides/")
 * into the instance, in order — later folders win on conflicts.
 */
export async function extractOverrides(
  zip: AdmZip,
  instanceDir: string,
  prefixes: string[]
): Promise<void> {
  for (const prefix of prefixes) {
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replace(/\\/g, '/')
      if (entry.isDirectory || !name.startsWith(prefix)) continue
      const rel = name.slice(prefix.length)
      if (rel === '') continue
      const dest = safeJoin(instanceDir, rel)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, entry.getData())
    }
  }
}
