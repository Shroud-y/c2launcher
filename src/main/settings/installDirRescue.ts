import { app, dialog } from 'electron'
import { rm } from 'fs/promises'
import { join } from 'path'
import { getDataDir, setDataDirOverride } from './store'
import { MIGRATE_DIRS, copyTree, hasEntries } from './dataMigrate'
import { DATA_DIR_IN_INSTALL_DIR_MESSAGE, isDataDirInInstallDir } from './installDirGuard'

/**
 * Startup rescue for users whose data dir already points inside the install
 * folder (allowed by older builds). The next update would wipe it, so before
 * the window opens we offer to move the game data back to the default
 * location. Runs once per launch; declining keeps everything as-is (the
 * updater separately refuses to install while the danger persists).
 */
export async function rescueDataDirFromInstallDir(): Promise<void> {
  if (!isDataDirInInstallDir()) return

  const source = getDataDir()
  const target = app.getPath('userData')

  // Refuse to merge into a default location that already holds game data —
  // silently mixing two data sets (or overwriting one) is worse than waiting
  // for the user to sort it out manually in Settings.
  for (const name of MIGRATE_DIRS) {
    if (await hasEntries(join(target, name))) {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Game data at risk',
        message: 'Your game data folder is in a dangerous location.',
        detail:
          `${DATA_DIR_IN_INSTALL_DIR_MESSAGE}\n\n` +
          'The default data folder already contains game data, so it cannot be moved ' +
          'back automatically. Open Settings and choose a data folder outside the ' +
          'installation folder before updating.'
      })
      return
    }
  }

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Move data now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Game data at risk',
    message: 'Move your game data out of the installation folder?',
    detail:
      `${DATA_DIR_IN_INSTALL_DIR_MESSAGE}\n\n` +
      `Current data folder:\n${source}\n\n` +
      `The launcher can move your instances and game files to the default location:\n${target}\n\n` +
      'Updates stay blocked until the data is out of the installation folder.'
  })
  if (response !== 0) return

  const present: string[] = []
  for (const name of MIGRATE_DIRS) {
    if (await hasEntries(join(source, name))) present.push(name)
  }

  try {
    for (const name of present) {
      await copyTree(join(source, name), join(target, name), () => undefined)
    }
  } catch (err) {
    // Roll back the partial copy; the source stays untouched.
    for (const name of MIGRATE_DIRS) {
      await rm(join(target, name), { recursive: true, force: true }).catch(() => undefined)
    }
    const message = err instanceof Error ? err.message : String(err)
    await dialog.showMessageBox({
      type: 'error',
      title: 'Move failed',
      message: 'Could not move the game data.',
      detail: `${message}\n\nYour data was left where it is. Try again from Settings.`
    })
    return
  }

  // Copy succeeded — the originals inside the install dir can go. A failed
  // delete is non-fatal: the data now lives safely in the default location.
  for (const name of present) {
    await rm(join(source, name), { recursive: true, force: true }).catch(() => undefined)
  }
  setDataDirOverride(null)
}
