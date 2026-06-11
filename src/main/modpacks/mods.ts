import { readdir, rename, rm } from 'fs/promises'
import { join } from 'path'
import { modrinthProvider } from '../discover/modrinth'
import { downloadFile } from '../minecraft/install'
import { getModpack, instanceDirFor } from './store'
import type { InstalledMod, InstallModParams } from '@shared/types'

/**
 * Mod files inside <instance>/mods. Disabling renames the jar to
 * <name>.jar.disabled so the loader skips it; no registry is kept —
 * the folder is the source of truth.
 */

const DISABLED_SUFFIX = '.disabled'

function modsDir(modpackId: string): string {
  const pack = getModpack(modpackId)
  if (pack === null) throw new Error('Modpack not found')
  return join(instanceDirFor(pack), 'mods')
}

/** Rejects names that could navigate outside the mods folder. */
function assertSafeFileName(fileName: string): void {
  if (fileName === '' || /[/\\]/.test(fileName) || fileName.includes('..')) {
    throw new Error(`Invalid mod file name: ${fileName}`)
  }
  if (!fileName.endsWith('.jar') && !fileName.endsWith(`.jar${DISABLED_SUFFIX}`)) {
    throw new Error(`Not a mod file: ${fileName}`)
  }
}

function toInstalledMod(fileName: string): InstalledMod {
  const enabled = !fileName.endsWith(DISABLED_SUFFIX)
  const base = enabled ? fileName : fileName.slice(0, -DISABLED_SUFFIX.length)
  return { fileName, name: base.replace(/\.jar$/, ''), enabled }
}

export async function listMods(modpackId: string): Promise<InstalledMod[]> {
  let entries: string[]
  try {
    entries = await readdir(modsDir(modpackId))
  } catch {
    return [] // No mods folder yet.
  }
  return entries
    .filter((f) => f.endsWith('.jar') || f.endsWith(`.jar${DISABLED_SUFFIX}`))
    .map(toInstalledMod)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function setModEnabled(
  modpackId: string,
  fileName: string,
  enabled: boolean
): Promise<InstalledMod> {
  assertSafeFileName(fileName)
  const dir = modsDir(modpackId)
  const current = toInstalledMod(fileName)
  if (current.enabled === enabled) return current

  const newName = enabled
    ? fileName.slice(0, -DISABLED_SUFFIX.length)
    : `${fileName}${DISABLED_SUFFIX}`
  try {
    await rename(join(dir, fileName), join(dir, newName))
  } catch {
    throw new Error('Could not toggle the mod — stop the game first')
  }
  return toInstalledMod(newName)
}

export async function removeModFile(modpackId: string, fileName: string): Promise<void> {
  assertSafeFileName(fileName)
  await rm(join(modsDir(modpackId), fileName), { force: true })
}

export async function installModFromModrinth(params: InstallModParams): Promise<InstalledMod> {
  if (params.source !== 'modrinth') {
    throw new Error('CurseForge installs arrive in a later phase')
  }
  const pack = getModpack(params.modpackId)
  if (pack === null) throw new Error('Modpack not found')
  if (pack.loader === null || pack.loader === 'vanilla') {
    throw new Error('This modpack has no mod loader — mods need Fabric, Forge or Quilt')
  }
  if (pack.gameVersion === null) {
    throw new Error('Assign a game version to the modpack first')
  }

  const versions = await modrinthProvider.getProjectVersions(params.projectId, {
    loaders: [pack.loader],
    gameVersions: [pack.gameVersion]
  })
  const file = versions
    .flatMap((v) => v.files)
    .find((f) => f.primary && f.filename.endsWith('.jar'))
    ?? versions.flatMap((v) => v.files).find((f) => f.filename.endsWith('.jar'))
  if (file === undefined) {
    throw new Error(`No ${pack.loader} build for Minecraft ${pack.gameVersion}`)
  }

  assertSafeFileName(file.filename)
  await downloadFile(
    file.url,
    join(modsDir(params.modpackId), file.filename),
    file.sha1 ?? undefined
  )
  return toInstalledMod(file.filename)
}
