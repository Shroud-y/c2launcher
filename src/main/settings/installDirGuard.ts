import { app } from 'electron'
import { dirname } from 'path'
import { getDataDir } from './store'
import { isInside } from './dataMigrate'

/**
 * Guards against putting game data inside the launcher's installation
 * folder. The NSIS updater removes the entire install dir when upgrading
 * (the old uninstaller runs `RMDir /r $INSTDIR`), so any user data stored
 * there is destroyed by the very next update. These helpers let the
 * settings IPC refuse such a data-dir choice and let the updater refuse to
 * install while the current data dir is in the danger zone.
 */

/** The app's install folder, or null when running unpackaged (dev). */
export function getInstallDir(): string | null {
  return app.isPackaged ? dirname(process.execPath) : null
}

/** True when the active data dir lives inside the install folder. */
export function isDataDirInInstallDir(): boolean {
  const installDir = getInstallDir()
  return installDir !== null && isInside(getDataDir(), installDir)
}

/** User-facing explanation used by every guard that fires on this state. */
export const DATA_DIR_IN_INSTALL_DIR_MESSAGE =
  'The game data folder is inside the launcher installation folder. ' +
  'Launcher updates erase that folder, which would destroy your instances and worlds.'
