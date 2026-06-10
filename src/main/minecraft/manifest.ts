/**
 * Mojang version manifest access with a 5-minute in-memory cache.
 */

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const CACHE_TTL_MS = 5 * 60 * 1000

export interface ManifestVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  sha1: string
}

interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: ManifestVersion[]
}

let cached: { manifest: VersionManifest; fetchedAt: number } | null = null

export async function getVersionManifest(): Promise<VersionManifest> {
  if (cached !== null && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.manifest
  }
  const res = await fetch(MANIFEST_URL)
  if (!res.ok) throw new Error(`Failed to fetch version manifest (${res.status})`)
  const manifest = (await res.json()) as VersionManifest
  cached = { manifest, fetchedAt: Date.now() }
  return manifest
}

export async function listReleaseVersionIds(): Promise<string[]> {
  const manifest = await getVersionManifest()
  return manifest.versions.filter((v) => v.type === 'release').map((v) => v.id)
}

export async function findManifestVersion(id: string): Promise<ManifestVersion> {
  const manifest = await getVersionManifest()
  const version = manifest.versions.find((v) => v.id === id)
  if (version === undefined) throw new Error(`Unknown Minecraft version: ${id}`)
  return version
}
