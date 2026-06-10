import Store from 'electron-store'
import { app } from 'electron'
import { existsSync } from 'fs'
import { cp, mkdir, rename, rm } from 'fs/promises'
import { join } from 'path'
import type { AppSettings } from '@shared/types'

/**
 * App settings. Config jsons stay in userData (they are tiny); only the
 * heavy game data directory is relocatable.
 *
 * Default data dir is Documents\C2Launcher — except when a pre-existing
 * install already has instances in userData, which keeps working there
 * until the user moves it.
 */

interface SettingsSchema {
  dataDir: string
}

let store: Store<SettingsSchema> | null = null

function getStore(): Store<SettingsSchema> {
  if (store === null) {
    store = new Store<SettingsSchema>({ name: 'settings', defaults: { dataDir: '' } })
  }
  return store
}

function defaultDataDir(): string {
  const legacy = app.getPath('userData')
  if (existsSync(join(legacy, 'instances'))) return legacy
  return join(app.getPath('documents'), 'C2Launcher')
}

export function getDataDir(): string {
  const stored = getStore().get('dataDir')
  if (stored !== '') return stored
  const dir = defaultDataDir()
  getStore().set('dataDir', dir)
  return dir
}

export function getSettings(): AppSettings {
  return { dataDir: getDataDir() }
}

/** Subfolders that hold the actual game data. */
const DATA_SUBDIRS = ['instances', 'minecraft'] as const

export async function moveDataDir(target: string): Promise<AppSettings> {
  const source = getDataDir()
  if (target === source) return getSettings()

  await mkdir(target, { recursive: true })
  for (const sub of DATA_SUBDIRS) {
    const from = join(source, sub)
    const to = join(target, sub)
    if (!existsSync(from)) continue
    if (existsSync(to)) {
      throw new Error(`"${to}" already exists — pick an empty folder`)
    }
    try {
      await rename(from, to)
    } catch {
      // Different drive — fall back to copy + delete.
      await cp(from, to, { recursive: true })
      await rm(from, { recursive: true, force: true })
    }
  }

  getStore().set('dataDir', target)
  return getSettings()
}
