import { app } from 'electron'
import Store from 'electron-store'
import type { AppSettings } from '@shared/types'

/**
 * All launcher state lives in the OS app-data folder (Electron userData)
 * by default: config jsons in the root, game data under instances/ and
 * minecraft/. The user may override the *game data* location and pick a
 * specific Java executable; both overrides persist in this config store,
 * which always stays in the real userData folder so the launcher can find
 * it regardless of the data-dir override.
 */

interface ConfigSchema {
  /** User-chosen data folder; null falls back to the default userData path. */
  dataDirOverride: string | null
  /** User-chosen Java executable; null uses the bundled/system Java. */
  javaPath: string | null
  /** Force the dedicated GPU for the game on hybrid-graphics machines. */
  preferDedicatedGpu: boolean
  /** Hide the launcher window to the system tray when a game launches. */
  minimizeToTrayOnLaunch: boolean
}

let store: Store<ConfigSchema> | null = null

function getStore(): Store<ConfigSchema> {
  if (store === null) {
    store = new Store<ConfigSchema>({
      name: 'config',
      defaults: {
        dataDirOverride: null,
        javaPath: null,
        preferDedicatedGpu: true,
        minimizeToTrayOnLaunch: false
      }
    })
  }
  return store
}

export function getDataDir(): string {
  const override = getStore().get('dataDirOverride')
  return override !== null && override !== '' ? override : app.getPath('userData')
}

export function isDataDirDefault(): boolean {
  const override = getStore().get('dataDirOverride')
  return override === null || override === ''
}

export function setDataDirOverride(dir: string | null): void {
  getStore().set('dataDirOverride', dir)
}

export function getJavaOverride(): string | null {
  return getStore().get('javaPath')
}

export function setJavaOverride(path: string | null): void {
  getStore().set('javaPath', path)
}

export function getPreferDedicatedGpu(): boolean {
  return getStore().get('preferDedicatedGpu')
}

export function setPreferDedicatedGpu(enabled: boolean): void {
  getStore().set('preferDedicatedGpu', enabled)
}

export function getMinimizeToTrayOnLaunch(): boolean {
  return getStore().get('minimizeToTrayOnLaunch')
}

export function setMinimizeToTrayOnLaunch(enabled: boolean): void {
  getStore().set('minimizeToTrayOnLaunch', enabled)
}

export function getSettings(): AppSettings {
  return {
    dataDir: getDataDir(),
    dataDirIsDefault: isDataDirDefault(),
    javaPath: getJavaOverride(),
    preferDedicatedGpu: getPreferDedicatedGpu(),
    minimizeToTrayOnLaunch: getMinimizeToTrayOnLaunch()
  }
}
