/**
 * Types for the per-version metadata json (piston-meta "client.json")
 * plus the OS rule evaluation shared by install and launch.
 */

export interface RuleOs {
  name?: string
  arch?: string
}

export interface Rule {
  action: 'allow' | 'disallow'
  os?: RuleOs
  features?: Record<string, boolean>
}

export interface Artifact {
  path: string
  sha1: string
  size: number
  url: string
}

export interface Library {
  name: string
  downloads?: { artifact?: Artifact; classifiers?: Record<string, Artifact> }
  /** Pre-1.19 native libraries: os name → classifier key (may contain `${arch}`). */
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  rules?: Rule[]
}

export type ArgumentEntry = string | { rules: Rule[]; value: string | string[] }

export interface VersionMeta {
  id: string
  mainClass: string
  assets: string
  assetIndex: { id: string; url: string; sha1: string; totalSize: number }
  downloads: { client: { url: string; sha1: string; size: number } }
  libraries: Library[]
  arguments?: { game: ArgumentEntry[]; jvm: ArgumentEntry[] }
  /** Pre-1.13 versions use a flat string instead of `arguments`. */
  minecraftArguments?: string
  javaVersion?: { majorVersion: number }
  type: string
}

/**
 * Resolves the native-classifier artifact of a library for the current
 * OS, or null when the library has no natives entry for it.
 */
export function nativeArtifactFor(lib: Library): Artifact | null {
  if (lib.natives === undefined || lib.downloads?.classifiers === undefined) return null
  const key = lib.natives[currentOsName()]
  if (key === undefined) return null
  const resolved = key.replace('${arch}', process.arch === 'ia32' ? '32' : '64')
  return lib.downloads.classifiers[resolved] ?? null
}

function currentOsName(): string {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'osx'
    default:
      return 'linux'
  }
}

/**
 * Evaluates manifest rules for the current OS. Entries gated on feature
 * flags (demo mode, custom resolution…) are always rejected — we never
 * enable those features.
 */
export function rulesAllow(rules: Rule[] | undefined): boolean {
  if (rules === undefined || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (rule.features !== undefined) {
      if (rule.action === 'allow') continue // feature-gated allow → skip entry
      return false
    }
    const archMatches =
      rule.os?.arch === undefined ||
      rule.os.arch === process.arch ||
      (rule.os.arch === 'x86' && process.arch === 'ia32')
    const osMatches =
      rule.os === undefined ||
      ((rule.os.name === undefined || rule.os.name === currentOsName()) && archMatches)
    if (osMatches) allowed = rule.action === 'allow'
  }
  return allowed
}
