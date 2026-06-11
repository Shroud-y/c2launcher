import type { Modpack } from '@shared/types'

/** "Fabric 1.21.10"-style subtitle, or null for packs without metadata. */
export function formatSubtitle(pack: Modpack): string | null {
  if (pack.loader === null || pack.gameVersion === null) return null
  const loaderLabel = pack.loader.charAt(0).toUpperCase() + pack.loader.slice(1)
  return `${loaderLabel} ${pack.gameVersion}`
}
