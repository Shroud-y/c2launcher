import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readdir, readFile, rename, rm, stat } from 'fs/promises'
import { join } from 'path'

/**
 * One-time rescue of data orphaned by the userData rename in v0.1.4. Older
 * builds stored everything under the productName folder ("C² Launcher");
 * v0.1.4 pinned userData to "c2launcher" (main/index.ts) with no migration,
 * so upgrading from ≤0.1.3 left the config, modpack registry and all game
 * data stranded in the old folder while the launcher started fresh.
 *
 * Must run before anything reads the electron-store files or getDataDir(),
 * so the moved config/registry are what the app actually loads.
 */

/** Everything worth carrying over; Chromium cache dirs are left behind. */
const MOVE_ENTRIES = ['config.json', 'modpacks.json', 'instances', 'minecraft', 'Partitions']

/**
 * Moves `src` to `dst`, merging directories that already exist at the
 * destination. Nested files that collide are skipped (the destination side
 * wins); `overwriteFile` lets the top level replace fresh-default config
 * files with the real ones from the old folder. Skipped leftovers stay in
 * the old folder rather than being deleted — this migration never destroys
 * anything.
 */
async function moveMerge(src: string, dst: string, overwriteFile: boolean): Promise<void> {
  if (!existsSync(dst)) {
    await rename(src, dst)
    return
  }
  const srcInfo = await stat(src)
  if (srcInfo.isDirectory()) {
    if (!(await stat(dst)).isDirectory()) return
    for (const entry of await readdir(src)) {
      await moveMerge(join(src, entry), join(dst, entry), false)
    }
    return
  }
  if (overwriteFile) {
    await rm(dst, { force: true })
    await rename(src, dst)
  }
}

export async function migrateLegacyUserData(): Promise<void> {
  try {
    const newDir = app.getPath('userData')
    const oldDir = join(app.getPath('appData'), 'C² Launcher')
    if (oldDir === newDir) return

    const oldHasData =
      existsSync(join(oldDir, 'config.json')) || existsSync(join(oldDir, 'modpacks.json'))
    if (!oldHasData) return

    // A non-empty registry in the new location means the user has real data
    // there already (e.g. rebuilt their packs after the upgrade) — merging
    // two live profiles is too risky, so leave both untouched.
    const newRegistry = join(newDir, 'modpacks.json')
    if (existsSync(newRegistry)) {
      let parsed: { modpacks?: unknown }
      try {
        parsed = JSON.parse(await readFile(newRegistry, 'utf8')) as { modpacks?: unknown }
      } catch {
        return
      }
      if (Array.isArray(parsed.modpacks) && parsed.modpacks.length > 0) return
    }

    await mkdir(newDir, { recursive: true })
    for (const name of MOVE_ENTRIES) {
      const src = join(oldDir, name)
      if (!existsSync(src)) continue
      await moveMerge(src, join(newDir, name), true)
    }
    console.log(`Migrated legacy launcher data from "${oldDir}" to "${newDir}"`)
  } catch (err) {
    // A failed migration must never block startup; the old folder is intact
    // and the next launch will try again.
    console.error('Legacy data migration failed:', err instanceof Error ? err.message : err)
  }
}
