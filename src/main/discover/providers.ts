import type { ContentSource } from '@shared/types'
import { curseforgeProvider } from './curseforge'
import { modrinthProvider } from './modrinth'
import type { ContentProvider } from './provider'

const PROVIDERS: Record<ContentSource, ContentProvider> = {
  modrinth: modrinthProvider,
  curseforge: curseforgeProvider
}

/** Provider for a renderer-supplied source; rejects anything unknown. */
export function providerFor(source: ContentSource): ContentProvider {
  if (!Object.hasOwn(PROVIDERS, source)) throw new Error(`Unknown content source: ${source}`)
  return PROVIDERS[source]
}
