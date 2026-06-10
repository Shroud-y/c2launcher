import type { Modpack } from '@shared/types'

/**
 * Hardcoded result data for the Discover page until Phase 4 wires the
 * Modrinth search IPC. Home uses real local modpacks since Phase 3.
 */

function placeholderPack(
  id: string,
  name: string,
  loader: Modpack['loader'],
  gameVersion: string | null,
  iconTint: Modpack['iconTint']
): Modpack {
  return {
    id,
    name,
    loader,
    gameVersion,
    iconTint,
    memoryMb: 4096,
    javaArgs: '',
    createdAt: 0,
    lastPlayedAt: null
  }
}

export const placeholderModpacks: Modpack[] = [
  placeholderPack('mp-1', 'Unnamed modpack', 'fabric', '1.21.10', 'teal'),
  placeholderPack('mp-2', 'Unnamed modpack', 'fabric', '1.21.10', 'teal'),
  placeholderPack('mp-3', 'create', null, null, 'mint'),
  placeholderPack('mp-4', 'Unnamed modpack', 'vanilla', '1.21.10', 'mint'),
  placeholderPack('mp-5', 'Unnamed modpack', null, null, 'light'),
  placeholderPack('mp-6', 'Unnamed modpack', null, null, 'light')
]

/** Free-text subtitle override for packs whose mockup subtitle is not loader+version. */
export const placeholderSubtitles: Record<string, string> = {
  'mp-3': 'very good modpack'
}

export function formatSubtitle(pack: Modpack): string | null {
  const override = placeholderSubtitles[pack.id]
  if (override !== undefined) return override
  if (pack.loader === null || pack.gameVersion === null) return null
  const loaderLabel = pack.loader.charAt(0).toUpperCase() + pack.loader.slice(1)
  return `${loaderLabel} ${pack.gameVersion}`
}
