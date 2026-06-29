import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { getDataDir } from '../settings/store'
import type { CreateModpackParams, IconTint, ModLoader, Modpack, ModpackSettings } from '@shared/types'

/**
 * Local modpack registry (metadata in electron-store) plus the on-disk
 * instance layout under the app-data dir (see settings/store):
 *
 *   <dataDir>/instances/<dirName>/   per-modpack game dir (saves, mods…)
 *   <dataDir>/minecraft/versions/    shared version jsons + client jars
 *   <dataDir>/minecraft/libraries/   shared maven-layout libraries
 *   <dataDir>/minecraft/assets/      shared asset index + objects
 *
 * Instance folders are named after the modpack (sanitized, deduplicated)
 * and renamed when the modpack is renamed.
 */

interface ModpackStoreSchema {
  modpacks: Modpack[]
}

let store: Store<ModpackStoreSchema> | null = null

function getStore(): Store<ModpackStoreSchema> {
  if (store === null) {
    store = new Store<ModpackStoreSchema>({ name: 'modpacks', defaults: { modpacks: [] } })
  }
  return store
}

export function instancesRoot(): string {
  return join(getDataDir(), 'instances')
}

export function instanceDir(dirName: string): string {
  return join(instancesRoot(), dirName)
}

/** Resolves a pack's folder, tolerating pre-migration records without dirName. */
export function instanceDirFor(pack: Modpack): string {
  const dirName = pack.dirName ?? ''
  return instanceDir(dirName === '' ? pack.id : dirName)
}

export function minecraftRoot(): string {
  return join(getDataDir(), 'minecraft')
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

function sanitizeDirName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[.\s]+$/, '')
    .trim()
  if (cleaned === '') return 'modpack'
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

function uniqueDirName(name: string, excludeId?: string): string {
  const taken = new Set(
    listModpacks()
      .filter((m) => m.id !== excludeId)
      // Pre-migration records have no dirName yet.
      .map((m) => (m.dirName ?? '').toLowerCase())
      .filter((d) => d !== '')
  )
  const base = sanitizeDirName(name)
  let candidate = base
  let counter = 2
  while (taken.has(candidate.toLowerCase()) || existsSync(instanceDir(candidate))) {
    candidate = `${base} (${counter})`
    counter += 1
  }
  return candidate
}

export function listModpacks(): Modpack[] {
  return getStore().get('modpacks')
}

export function getModpack(id: string): Modpack | null {
  return listModpacks().find((m) => m.id === id) ?? null
}

const TINT_CYCLE: IconTint[] = ['teal', 'mint', 'light']

/**
 * Per-instance metadata file inside the instance folder. Lets the
 * launcher re-adopt copied/moved instance folders with their loader,
 * version and settings intact.
 */
const INSTANCE_FILE = 'c2instance.json'

const LOADERS: ModLoader[] = ['fabric', 'forge', 'quilt', 'neoforge', 'vanilla']

interface InstanceFileData {
  loader: ModLoader | null
  gameVersion: string | null
  loaderVersion: string | null
  memoryMb: number
  javaArgs: string
}

async function writeInstanceFile(pack: Modpack): Promise<void> {
  const data: InstanceFileData = {
    loader: pack.loader,
    gameVersion: pack.gameVersion,
    loaderVersion: pack.loaderVersion ?? null,
    memoryMb: pack.memoryMb,
    javaArgs: pack.javaArgs
  }
  try {
    const dir = instanceDirFor(pack)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, INSTANCE_FILE), JSON.stringify(data, null, 2))
  } catch (err) {
    console.error(`Failed to write ${INSTANCE_FILE} for "${pack.name}":`, err)
  }
}

async function readInstanceFile(dir: string): Promise<Partial<InstanceFileData>> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(dir, INSTANCE_FILE), 'utf-8'))
    if (typeof raw !== 'object' || raw === null) return {}
    const obj = raw as Record<string, unknown>
    const result: Partial<InstanceFileData> = {}
    if (typeof obj.loader === 'string' && (LOADERS as string[]).includes(obj.loader)) {
      result.loader = obj.loader as ModLoader
    }
    if (typeof obj.gameVersion === 'string' && obj.gameVersion !== '') {
      result.gameVersion = obj.gameVersion
    }
    if (typeof obj.loaderVersion === 'string' && obj.loaderVersion !== '') {
      result.loaderVersion = obj.loaderVersion
    }
    if (typeof obj.memoryMb === 'number' && Number.isFinite(obj.memoryMb)) {
      result.memoryMb = obj.memoryMb
    }
    if (typeof obj.javaArgs === 'string') {
      result.javaArgs = obj.javaArgs
    }
    return result
  } catch {
    return {}
  }
}

export async function createModpack(params: CreateModpackParams): Promise<Modpack> {
  const existing = listModpacks()
  const name = params.name.trim() === '' ? 'Unnamed modpack' : params.name.trim()
  const modpack: Modpack = {
    id: randomUUID(),
    name,
    dirName: uniqueDirName(name),
    loader: params.loader,
    gameVersion: params.gameVersion,
    loaderVersion: params.loaderVersion ?? null,
    iconTint: TINT_CYCLE[Math.floor(existing.length / 2) % TINT_CYCLE.length],
    memoryMb: 4096,
    javaArgs: '',
    createdAt: Date.now(),
    lastPlayedAt: null
  }
  await mkdir(join(instanceDir(modpack.dirName), 'mods'), { recursive: true })
  getStore().set('modpacks', [...existing, modpack])
  await writeInstanceFile(modpack)
  return modpack
}

export function updateModpack(id: string, patch: Partial<Modpack>): Modpack | null {
  const modpacks = listModpacks()
  const index = modpacks.findIndex((m) => m.id === id)
  if (index === -1) return null
  const updated = { ...modpacks[index], ...patch, id }
  modpacks[index] = updated
  getStore().set('modpacks', modpacks)
  return updated
}

/**
 * Applies settings; a rename also renames the instance folder. The
 * caller must ensure the pack is not running or installing.
 */
export async function applySettings(id: string, settings: ModpackSettings): Promise<Modpack | null> {
  const current = getModpack(id)
  if (current === null) return null

  const name = settings.name.trim() === '' ? 'Unnamed modpack' : settings.name.trim()
  let dirName = current.dirName

  if (name !== current.name) {
    const newDirName = uniqueDirName(name, id)
    const oldPath = instanceDir(current.dirName)
    if (newDirName.toLowerCase() !== current.dirName.toLowerCase() && existsSync(oldPath)) {
      try {
        await rename(oldPath, instanceDir(newDirName))
      } catch {
        throw new Error('Could not rename the instance folder — close the game and any open files first')
      }
    }
    dirName = newDirName
  }

  const updated = updateModpack(id, {
    name,
    dirName,
    memoryMb: Math.max(512, Math.min(65536, Math.round(settings.memoryMb))),
    javaArgs: settings.javaArgs.trim(),
    gameVersion: settings.gameVersion ?? current.gameVersion,
    loader: settings.loader === undefined ? current.loader : settings.loader,
    loaderVersion:
      settings.loaderVersion === undefined ? current.loaderVersion : settings.loaderVersion
  })
  if (updated !== null) await writeInstanceFile(updated)
  return updated
}

/**
 * One-time migration: packs created before named folders used the UUID
 * as the folder name and have no dirName field.
 */
export async function migrateInstanceDirs(): Promise<void> {
  for (const pack of listModpacks()) {
    if (pack.dirName !== undefined && pack.dirName !== '') continue
    const dirName = uniqueDirName(pack.name, pack.id)
    const legacyPath = instanceDir(pack.id)
    if (existsSync(legacyPath)) {
      try {
        await rename(legacyPath, instanceDir(dirName))
      } catch (err) {
        // Folder locked — keep the UUID folder for now; next run retries.
        console.error(`Instance folder migration failed for "${pack.name}":`, err)
        continue
      }
    }
    updateModpack(pack.id, { dirName })
  }
}

/** Removes the registry record and permanently deletes the instance folder. */
export async function deleteModpack(id: string): Promise<void> {
  const pack = getModpack(id)
  if (pack === null) return
  const dir = instanceDirFor(pack)
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true })
  }
  getStore().set(
    'modpacks',
    listModpacks().filter((m) => m.id !== id)
  )
}

// Coalesces concurrent calls into a single run: the renderer loads the
// modpack list from several effects at once (and React StrictMode double-
// fires them in dev), which otherwise let two adoptions read the same empty
// registry and add every unknown folder twice.
let adoptionInFlight: Promise<void> | null = null

export function adoptUnknownInstances(): Promise<void> {
  adoptionInFlight ??= runAdoption().finally(() => {
    adoptionInFlight = null
  })
  return adoptionInFlight
}

/**
 * Adopts instance folders the registry does not know about — copied
 * instances, folders renamed by hand, or instances moved from another
 * launcher. Folder name becomes the modpack name; loader/version come
 * from a c2instance.json when present, otherwise stay unassigned until
 * the user picks a version in settings.
 */
async function runAdoption(): Promise<void> {
  const root = instancesRoot()
  if (!existsSync(root)) return

  const known = new Set(
    listModpacks().map((m) => ((m.dirName ?? '') === '' ? m.id : m.dirName).toLowerCase())
  )

  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (known.has(entry.name.toLowerCase())) continue

    const fileData = await readInstanceFile(join(root, entry.name))
    const modpacks = listModpacks()
    const adopted: Modpack = {
      id: randomUUID(),
      name: entry.name,
      dirName: entry.name,
      loader: fileData.loader ?? null,
      gameVersion: fileData.gameVersion ?? null,
      loaderVersion: fileData.loaderVersion ?? null,
      iconTint: TINT_CYCLE[Math.floor(modpacks.length / 2) % TINT_CYCLE.length],
      memoryMb: Math.max(512, Math.min(65536, Math.round(fileData.memoryMb ?? 4096))),
      javaArgs: fileData.javaArgs ?? '',
      createdAt: Date.now(),
      lastPlayedAt: null
    }
    getStore().set('modpacks', [...modpacks, adopted])
    await writeInstanceFile(adopted)
  }
}
