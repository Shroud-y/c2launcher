import { useEffect, useRef } from 'react'
import CategoryTabs from '../components/discover/CategoryTabs'
import SearchBar from '../components/discover/SearchBar'
import SortFilter from '../components/discover/SortFilter'
import SearchResultCard from '../components/discover/SearchResultCard'
import { useDiscoverStore } from '../store/discoverStore'
import { useModpackStore } from '../store/modpackStore'
import type { ContentCategory } from '@shared/types'
import styles from './Discover.module.css'

const SEARCH_PLACEHOLDERS: Record<ContentCategory, string> = {
  modpacks: 'Search modpacks…',
  mods: 'Search mods…',
  resourcepacks: 'Search resource packs…',
  datapacks: 'Search data packs…',
  shaders: 'Search shaders…'
}

const TEXT_DEBOUNCE_MS = 400

export default function Discover(): JSX.Element {
  const category = useDiscoverStore((s) => s.category)
  const text = useDiscoverStore((s) => s.text)
  const sort = useDiscoverStore((s) => s.sort)
  const page = useDiscoverStore((s) => s.page)
  const pageSize = useDiscoverStore((s) => s.pageSize)
  const gameVersion = useDiscoverStore((s) => s.gameVersion)
  const loader = useDiscoverStore((s) => s.loader)
  const tags = useDiscoverStore((s) => s.tags)
  const results = useDiscoverStore((s) => s.results)
  const loading = useDiscoverStore((s) => s.loading)
  const error = useDiscoverStore((s) => s.error)
  const setCategory = useDiscoverStore((s) => s.setCategory)
  const setText = useDiscoverStore((s) => s.setText)
  const search = useDiscoverStore((s) => s.search)
  const installTarget = useDiscoverStore((s) => s.installTarget)
  const setInstallTarget = useDiscoverStore((s) => s.setInstallTarget)

  const modpacksLoaded = useModpackStore((s) => s.loaded)
  const loadModpacks = useModpackStore((s) => s.load)
  const targetPack = useModpackStore((s) =>
    installTarget === null ? null : s.modpacks.find((m) => m.id === installTarget) ?? null
  )

  // Mod installs need the local pack list for the target picker.
  useEffect(() => {
    if (!modpacksLoaded) void loadModpacks()
  }, [modpacksLoaded, loadModpacks])

  // One effect for every query input: typing is debounced, everything
  // else (tabs, filters, pagination) searches immediately.
  const prevText = useRef(text)
  useEffect(() => {
    const delay = prevText.current !== text ? TEXT_DEBOUNCE_MS : 0
    prevText.current = text
    const timer = setTimeout(() => void search(), delay)
    return () => clearTimeout(timer)
  }, [category, text, sort, page, pageSize, gameVersion, loader, tags, installTarget, search])

  return (
    <div className={styles.page}>
      {targetPack !== null && (
        <div className={styles.targetBanner}>
          <span>
            Installing into <strong>{targetPack.name}</strong>
          </span>
          <button
            type="button"
            className={styles.targetClear}
            onClick={() => setInstallTarget(null)}
          >
            ×
          </button>
        </div>
      )}
      <CategoryTabs active={category} onChange={setCategory} />
      <SearchBar
        value={text}
        placeholder={SEARCH_PLACEHOLDERS[category]}
        onChange={setText}
      />
      <SortFilter />

      {error !== null && <div className={styles.error}>{error}</div>}

      {loading && results.length === 0 ? (
        <div className={styles.stateNote}>Searching…</div>
      ) : results.length === 0 && error === null ? (
        <div className={styles.stateNote}>No results. Try a different search or filters.</div>
      ) : (
        <div className={styles.grid}>
          {results.map((result) => (
            <SearchResultCard key={result.id} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}
