import Store from 'electron-store'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import type { CreateModpackParams, IconTint, Modpack, ModpackSettings } from '@shared/types'

/**
 * Local modpack registry (metadata in electron-store) plus the on-disk
 * instance layout:
 *
 *   <userData>/instances/<id>/        per-modpack game dir (saves, mods…)
 *   <userData>/minecraft/versions/    shared version jsons + client jars
 *   <userData>/minecraft/libraries/   shared maven-layout libraries
 *   <userData>/minecraft/assets/      shared asset index + objects
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
  return join(app.getPath('userData'), 'instances')
}

export function instanceDir(id: string): string {
  return join(instancesRoot(), id)
}

export function minecraftRoot(): string {
  return join(app.getPath('userData'), 'minecraft')
}

export function listModpacks(): Modpack[] {
  return getStore().get('modpacks')
}

export function getModpack(id: string): Modpack | null {
  return listModpacks().find((m) => m.id === id) ?? null
}

const TINT_CYCLE: IconTint[] = ['teal', 'mint', 'light']

export async function createModpack(params: CreateModpackParams): Promise<Modpack> {
  const existing = listModpacks()
  const modpack: Modpack = {
    id: randomUUID(),
    name: params.name.trim() === '' ? 'Unnamed modpack' : params.name.trim(),
    loader: params.loader,
    gameVersion: params.gameVersion,
    iconTint: TINT_CYCLE[existing.length % TINT_CYCLE.length],
    memoryMb: 4096,
    javaArgs: '',
    createdAt: Date.now(),
    lastPlayedAt: null
  }
  await mkdir(join(instanceDir(modpack.id), 'mods'), { recursive: true })
  getStore().set('modpacks', [...existing, modpack])
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

export function applySettings(id: string, settings: ModpackSettings): Modpack | null {
  return updateModpack(id, {
    name: settings.name.trim() === '' ? 'Unnamed modpack' : settings.name.trim(),
    memoryMb: Math.max(512, Math.min(65536, Math.round(settings.memoryMb))),
    javaArgs: settings.javaArgs.trim()
  })
}
