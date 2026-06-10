import type { Modpack, ModpackDetail } from '@shared/types'

/**
 * Hardcoded Phase 1 data mirroring the design mockups.
 * Replaced by `modpack:list` IPC in Phase 3.
 */
export const placeholderModpacks: Modpack[] = [
  { id: 'mp-1', name: 'Unnamed modpack', loader: 'fabric', gameVersion: '1.21.10', iconTint: 'teal' },
  { id: 'mp-2', name: 'Unnamed modpack', loader: 'fabric', gameVersion: '1.21.10', iconTint: 'teal' },
  { id: 'mp-3', name: 'create', loader: null, gameVersion: null, iconTint: 'mint' },
  { id: 'mp-4', name: 'Unnamed modpack', loader: 'vanilla', gameVersion: '1.21.10', iconTint: 'mint' },
  { id: 'mp-5', name: 'Unnamed modpack', loader: null, gameVersion: null, iconTint: 'light' },
  { id: 'mp-6', name: 'Unnamed modpack', loader: null, gameVersion: null, iconTint: 'light' }
]

/** Free-text subtitle override for packs whose mockup subtitle is not loader+version. */
export const placeholderSubtitles: Record<string, string> = {
  'mp-3': 'very good modpack'
}

/** Number of empty placeholder slots rendered after the real cards. */
export const emptySlotCount = 4

export function getPlaceholderDetail(id: string): ModpackDetail {
  const pack = placeholderModpacks.find((p) => p.id === id) ?? placeholderModpacks[0]
  return {
    ...pack,
    mods: [
      { id: 'mod-1', name: 'Fabric API', version: '0.110.0', enabled: true },
      { id: 'mod-2', name: 'Sodium', version: '0.6.5', enabled: true },
      { id: 'mod-3', name: 'Lithium', version: '0.14.3', enabled: true },
      { id: 'mod-4', name: 'Iris Shaders', version: '1.8.1', enabled: false }
    ],
    memoryMb: 4096,
    javaArgs: '-XX:+UseG1GC',
    updateAvailable: pack.id === 'mp-1'
  }
}

export function formatSubtitle(pack: Modpack): string | null {
  const override = placeholderSubtitles[pack.id]
  if (override !== undefined) return override
  if (pack.loader === null || pack.gameVersion === null) return null
  const loaderLabel = pack.loader.charAt(0).toUpperCase() + pack.loader.slice(1)
  return `${loaderLabel} ${pack.gameVersion}`
}
