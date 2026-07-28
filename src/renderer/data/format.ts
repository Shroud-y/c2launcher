import type { Modpack } from '@shared/types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Coarse "2h ago" for recent timestamps, an absolute date past a month.
 * Deliberately not live-updating: it labels a launch that already happened, so
 * a re-render is the only thing that needs to refresh it.
 */
export function formatRelativeTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp
  // Clock skew (or a registry edited by hand) can put the stamp in the future.
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d ago`
  return new Date(timestamp).toLocaleDateString()
}

/** "Fabric 1.21.10"-style subtitle, or null for packs without metadata. */
export function formatSubtitle(pack: Modpack): string | null {
  if (pack.loader === null || pack.gameVersion === null) return null
  const loaderLabel = pack.loader.charAt(0).toUpperCase() + pack.loader.slice(1)
  return `${loaderLabel} ${pack.gameVersion}`
}
