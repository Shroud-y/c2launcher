import { app } from 'electron'
import type { AppSettings } from '@shared/types'

/**
 * All launcher state lives in the OS app-data folder (Electron userData):
 * config jsons in the root, game data under instances/ and minecraft/.
 */

export function getDataDir(): string {
  return app.getPath('userData')
}

export function getSettings(): AppSettings {
  return { dataDir: getDataDir() }
}
