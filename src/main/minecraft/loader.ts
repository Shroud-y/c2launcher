import { join } from 'path'
import type { ModLoader } from '@shared/types'
import { downloadAll, type DownloadTask } from './install'
import { mergeLibraries, type ArgumentEntry, type Library, type VersionMeta } from './versionMeta'

/**
 * Fabric and Quilt loader support via their meta servers. Both publish
 * a launcher profile json that inherits from the vanilla version: a new
 * mainClass, extra maven libraries and extra arguments. We merge it
 * into the vanilla VersionMeta so install/launch stay loader-agnostic.
 *
 * Forge and NeoForge ship installer jars instead of profile jsons and
 * are handled separately in `forge.ts`.
 */

interface MetaServer {
  base: string
  defaultMaven: string
}

const META_SERVERS: Partial<Record<ModLoader, MetaServer>> = {
  fabric: { base: 'https://meta.fabricmc.net/v2', defaultMaven: 'https://maven.fabricmc.net/' },
  quilt: { base: 'https://meta.quiltmc.org/v3', defaultMaven: 'https://maven.quiltmc.org/repository/release/' }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Loader meta request failed (${res.status}): ${url}`)
  return (await res.json()) as T
}

interface LoaderVersionEntry {
  loader: { version: string; stable?: boolean }
}

/** Latest stable loader version for a game version (first entry is newest). */
export async function resolveLoaderVersion(
  loader: 'fabric' | 'quilt',
  gameVersion: string
): Promise<string> {
  const server = META_SERVERS[loader]
  if (server === undefined) throw new Error(`No meta server for ${loader}`)
  const entries = await fetchJson<LoaderVersionEntry[]>(
    `${server.base}/versions/loader/${encodeURIComponent(gameVersion)}`
  )
  if (entries.length === 0) {
    throw new Error(`${loader} has no builds for Minecraft ${gameVersion}`)
  }
  const stable = entries.find((e) => e.loader.stable === true)
  return (stable ?? entries[0]).loader.version
}

/** "group:artifact:version[:classifier]" → maven repository path. */
function mavenPath(coordinate: string): string {
  const [group, artifact, version, classifier] = coordinate.split(':')
  if (group === undefined || artifact === undefined || version === undefined) {
    throw new Error(`Bad maven coordinate: ${coordinate}`)
  }
  const file =
    classifier === undefined
      ? `${artifact}-${version}.jar`
      : `${artifact}-${version}-${classifier}.jar`
  return [...group.split('.'), artifact, version, file].join('/')
}

interface ProfileLibrary {
  name: string
  url?: string
  sha1?: string
  size?: number
}

interface LoaderProfile {
  id: string
  mainClass: string
  inheritsFrom: string
  arguments?: { game?: ArgumentEntry[]; jvm?: ArgumentEntry[] }
  libraries: ProfileLibrary[]
}

/**
 * Downloads the loader's libraries and returns the vanilla meta merged
 * with the loader profile. The merged meta keeps the vanilla id so the
 * client jar and natives paths stay valid.
 */
export async function applyLoader(
  root: string,
  vanillaMeta: VersionMeta,
  loader: 'fabric' | 'quilt',
  gameVersion: string,
  pinnedLoaderVersion: string | null,
  report: (percent: number, message: string) => void
): Promise<VersionMeta> {
  const server = META_SERVERS[loader]
  if (server === undefined) throw new Error(`No meta server for ${loader}`)

  report(0, `Resolving ${loader} loader`)
  const loaderVersion = pinnedLoaderVersion ?? (await resolveLoaderVersion(loader, gameVersion))

  const profile = await fetchJson<LoaderProfile>(
    `${server.base}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  )

  const tasks: DownloadTask[] = []
  const mergedLibraries: Library[] = []
  for (const lib of profile.libraries) {
    const path = mavenPath(lib.name)
    const url = `${lib.url ?? server.defaultMaven}${path}`
    tasks.push({ url, dest: join(root, 'libraries', ...path.split('/')), size: lib.size, sha1: lib.sha1 })
    mergedLibraries.push({
      name: lib.name,
      downloads: { artifact: { path, url, sha1: lib.sha1 ?? '', size: lib.size ?? 0 } }
    })
  }

  await downloadAll(tasks, (done, total) => {
    report((done / Math.max(total, 1)) * 100, `${loader} libraries ${done}/${total}`)
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
