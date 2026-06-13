import { spawn } from 'child_process'
import { readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { downloadAll, downloadFile, versionJsonPath, type DownloadTask } from './install'
import { mergeLibraries, type ArgumentEntry, type Library, type VersionMeta } from './versionMeta'

/**
 * Forge and NeoForge support. Neither publishes a launcher profile API:
 * they ship installer jars whose processors binary-patch the vanilla
 * client into `libraries/`. We download the official installer and run
 * it headless (`--installClient <root>`); it writes
 * `versions/<id>/<id>.json`, which we then merge into the vanilla
 * VersionMeta the same way the Fabric/Quilt profile jsons are merged.
 */

export type ForgeLikeLoader = 'forge' | 'neoforge'

const FORGE_PROMOTIONS =
  'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'
const FORGE_METADATA =
  'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
const NEOFORGE_VERSIONS =
  'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
// NeoForge's first MC, 1.20.1, predates the neoforge artifact: it lives under
// the legacy net.neoforged:forge artifact, versioned 1.20.1-47.1.x.
const NEOFORGE_LEGACY_VERSIONS =
  'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/forge'
const NEOFORGE_LEGACY_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/forge'
const NEOFORGE_LEGACY_MC = '1.20.1'

const INSTALLER_TIMEOUT_MS = 10 * 60 * 1000

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Loader meta request failed (${res.status}): ${url}`)
  return (await res.json()) as T
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Loader meta request failed (${res.status}): ${url}`)
  return res.text()
}

/** All loader builds for a game version, newest first. */
export async function listForgeLikeVersions(
  loader: ForgeLikeLoader,
  gameVersion: string
): Promise<string[]> {
  if (loader === 'forge') {
    if (minecraftMinor(gameVersion) < 13) return []
    const xml = await fetchText(FORGE_METADATA)
    const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
    const prefix = `${gameVersion}-`
    // maven-metadata is oldest→newest; reverse for newest first.
    return all.filter((v) => v.startsWith(prefix)).map((v) => v.slice(prefix.length)).reverse()
  }
  if (gameVersion === NEOFORGE_LEGACY_MC) {
    const { versions } = await fetchJson<{ versions: string[] }>(NEOFORGE_LEGACY_VERSIONS)
    const prefix = `${NEOFORGE_LEGACY_MC}-`
    return versions.filter((v) => v.startsWith(prefix)).map((v) => v.slice(prefix.length)).reverse()
  }
  const { versions } = await fetchJson<{ versions: string[] }>(NEOFORGE_VERSIONS)
  return versions.filter((v) => v.startsWith(neoforgePrefix(gameVersion))).reverse()
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function minecraftMinor(gameVersion: string): number {
  const match = /^1\.(\d+)/.exec(gameVersion)
  return match === null ? 0 : Number(match[1])
}

/**
 * NeoForge versions track Minecraft:
 *  - Old "1.MINOR[.PATCH]" scheme → MINOR.PATCH.x (MC 1.21.4 → 21.4.x, 1.21 → 21.0.x).
 *  - Calendar scheme "YY.MINOR.PATCH" → the full version + .x (MC 26.1.2 → 26.1.2.x).
 */
function neoforgePrefix(gameVersion: string): string {
  if (gameVersion.startsWith('1.')) {
    const parts = gameVersion.split('.')
    return `${parts[1] ?? '0'}.${parts[2] ?? '0'}.`
  }
  return `${gameVersion}.`
}

/** Picks the newest non-beta entry (falling back to betas if that's all there is). */
function pickLatest(candidates: string[], label: string): string {
  if (candidates.length === 0) throw new Error(label)
  const stable = candidates.filter((v) => !v.includes('beta'))
  const pool = stable.length > 0 ? stable : candidates
  return pool[pool.length - 1]
}

export async function resolveForgeVersion(
  loader: ForgeLikeLoader,
  gameVersion: string
): Promise<string> {
  if (loader === 'forge') {
    const { promos } = await fetchJson<{ promos: Record<string, string> }>(FORGE_PROMOTIONS)
    const version = promos[`${gameVersion}-recommended`] ?? promos[`${gameVersion}-latest`]
    if (version === undefined) {
      throw new Error(`Forge has no builds for Minecraft ${gameVersion}`)
    }
    return version
  }
  const noBuilds = `NeoForge has no builds for Minecraft ${gameVersion}`
  // 1.20.1 lives under the legacy net.neoforged:forge artifact as 1.20.1-47.1.x.
  if (gameVersion === NEOFORGE_LEGACY_MC) {
    const { versions } = await fetchJson<{ versions: string[] }>(NEOFORGE_LEGACY_VERSIONS)
    const prefix = `${NEOFORGE_LEGACY_MC}-`
    const candidates = versions.filter((v) => v.startsWith(prefix))
    // Store just the build (47.1.x); the MC prefix is re-added where needed.
    return pickLatest(candidates, noBuilds).slice(prefix.length)
  }
  const { versions } = await fetchJson<{ versions: string[] }>(NEOFORGE_VERSIONS)
  const candidates = versions.filter((v) => v.startsWith(neoforgePrefix(gameVersion)))
  return pickLatest(candidates, noBuilds)
}

function versionIdFor(loader: ForgeLikeLoader, gameVersion: string, loaderVersion: string): string {
  if (loader === 'forge') return `${gameVersion}-forge-${loaderVersion}`
  // The legacy 1.20.1 installer writes id "1.20.1-forge-47.1.x".
  if (gameVersion === NEOFORGE_LEGACY_MC) return `${NEOFORGE_LEGACY_MC}-forge-${loaderVersion}`
  return `neoforge-${loaderVersion}`
}

function installerUrlFor(
  loader: ForgeLikeLoader,
  gameVersion: string,
  loaderVersion: string
): string {
  if (loader === 'forge') {
    const full = `${gameVersion}-${loaderVersion}`
    return `${FORGE_MAVEN}/${full}/forge-${full}-installer.jar`
  }
  if (gameVersion === NEOFORGE_LEGACY_MC) {
    const full = `${NEOFORGE_LEGACY_MC}-${loaderVersion}`
    return `${NEOFORGE_LEGACY_MAVEN}/${full}/forge-${full}-installer.jar`
  }
  return `${NEOFORGE_MAVEN}/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`
}

function runInstaller(javaPath: string, installerPath: string, root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', installerPath, '--installClient', root], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const tail: string[] = []
    function keep(chunk: Buffer): void {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.trim() === '') continue
        tail.push(line)
        if (tail.length > 20) tail.shift()
      }
    }
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Loader installer timed out'))
    }, INSTALLER_TIMEOUT_MS)

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(`Loader installer failed (exit ${code ?? 'unknown'}): ${tail.slice(-5).join(' | ')}`)
        )
      }
    })
  })
}

async function installLoaderVersion(
  root: string,
  loader: ForgeLikeLoader,
  gameVersion: string,
  loaderVersion: string,
  javaPath: string,
  report: (percent: number, message: string) => void
): Promise<void> {
  const installerPath = join(
    root,
    'installers',
    `${loader}-${gameVersion}-${loaderVersion}-installer.jar`
  )
  report(10, `Downloading ${loader} installer`)
  await downloadFile(installerUrlFor(loader, gameVersion, loaderVersion), installerPath)

  // The installer refuses to run without a launcher profiles file.
  const profilesPath = join(root, 'launcher_profiles.json')
  if (!(await fileExists(profilesPath))) {
    await writeFile(profilesPath, JSON.stringify({ profiles: {} }))
  }

  report(25, `Running ${loader} installer (this can take a minute)`)
  try {
    await runInstaller(javaPath, installerPath, root)
  } finally {
    await rm(installerPath, { force: true })
  }
}

interface ForgeLibrary {
  name: string
  downloads?: { artifact?: { path: string; url: string; sha1?: string; size?: number } }
}

interface ForgeVersionJson {
  id: string
  mainClass: string
  arguments?: { game?: ArgumentEntry[]; jvm?: ArgumentEntry[] }
  libraries?: ForgeLibrary[]
}

/** Libraries with an empty url are produced locally by the installer's processors. */
async function generatedLibsPresent(root: string, profile: ForgeVersionJson): Promise<boolean> {
  for (const lib of profile.libraries ?? []) {
    const artifact = lib.downloads?.artifact
    if (artifact === undefined || artifact.url !== '') continue
    if (!(await fileExists(join(root, 'libraries', ...artifact.path.split('/'))))) return false
  }
  return true
}

/**
 * Ensures the Forge/NeoForge version is installed (running the official
 * installer on first use) and returns the vanilla meta merged with the
 * loader's version json. The merged meta keeps the vanilla id so the
 * client jar and natives paths stay valid.
 */
export async function applyForgeLoader(
  root: string,
  vanillaMeta: VersionMeta,
  loader: ForgeLikeLoader,
  gameVersion: string,
  pinnedLoaderVersion: string | null,
  javaPath: string,
  report: (percent: number, message: string) => void
): Promise<VersionMeta> {
  // Pre-1.13 installers have no headless mode and use the legacy
  // minecraftArguments format — out of scope.
  if (loader === 'forge' && minecraftMinor(gameVersion) < 13) {
    throw new Error('Forge is only supported for Minecraft 1.13 and newer')
  }

  report(0, `Resolving ${loader} version`)
  const loaderVersion = pinnedLoaderVersion ?? (await resolveForgeVersion(loader, gameVersion))
  const versionId = versionIdFor(loader, gameVersion, loaderVersion)
  const jsonPath = versionJsonPath(root, versionId)

  let ranInstaller = false
  if (!(await fileExists(jsonPath))) {
    await installLoaderVersion(root, loader, gameVersion, loaderVersion, javaPath, report)
    ranInstaller = true
  }

  let profile = JSON.parse(await readFile(jsonPath, 'utf-8')) as ForgeVersionJson

  // The json can outlive a wiped libraries folder — reinstall once if
  // any processor-generated jar is missing.
  if (!ranInstaller && !(await generatedLibsPresent(root, profile))) {
    await installLoaderVersion(root, loader, gameVersion, loaderVersion, javaPath, report)
    profile = JSON.parse(await readFile(jsonPath, 'utf-8')) as ForgeVersionJson
  }

  report(80, `Verifying ${loader} libraries`)
  const tasks: DownloadTask[] = []
  const mergedLibraries: Library[] = []
  for (const lib of profile.libraries ?? []) {
    const artifact = lib.downloads?.artifact
    if (artifact === undefined) continue
    mergedLibraries.push({
      name: lib.name,
      downloads: {
        artifact: {
          path: artifact.path,
          url: artifact.url,
          sha1: artifact.sha1 ?? '',
          size: artifact.size ?? 0
        }
      }
    })
    if (artifact.url === '') continue
    tasks.push({
      url: artifact.url,
      dest: join(root, 'libraries', ...artifact.path.split('/')),
      size: artifact.size,
      sha1: artifact.sha1
    })
  }
  await downloadAll(tasks, (done, total) => {
    report(80 + (done / Math.max(total, 1)) * 20, `${loader} libraries ${done}/${total}`)
  })

  const vanillaArgs = vanillaMeta.arguments
  return {
    ...vanillaMeta,
    mainClass: profile.mainClass,
    libraries: mergeLibraries(mergedLibraries, vanillaMeta.libraries),
    arguments:
      vanillaArgs === undefined
        ? undefined
        : {
            jvm: [...vanillaArgs.jvm, ...(profile.arguments?.jvm ?? [])],
            game: [...vanillaArgs.game, ...(profile.arguments?.game ?? [])]
          }
  }
}
