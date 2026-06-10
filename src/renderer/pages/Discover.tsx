import { useState } from 'react'
import CategoryTabs from '../components/discover/CategoryTabs'
import SearchBar from '../components/discover/SearchBar'
import SortFilter from '../components/discover/SortFilter'
import ModpackGrid from '../components/modpack/ModpackGrid'
import { placeholderModpacks } from '../data/placeholders'
import type { ContentCategory } from '@shared/types'
import styles from './Discover.module.css'

const SEARCH_PLACEHOLDERS: Record<ContentCategory, string> = {
  modpacks: 'Search modpacks…',
  mods: 'Search mods…',
  resourcepacks: 'Search resource packs…',
  datapacks: 'Search data packs…',
  shaders: 'Search shaders…'
}

export default function Discover(): JSX.Element {
  const [category, setCategory] = useState<ContentCategory>('modpacks')
  const [searchText, setSearchText] = useState('')

  return (
    <div className={styles.page}>
      <CategoryTabs active={category} onChange={setCategory} />
      <SearchBar
        value={searchText}
        placeholder={SEARCH_PLACEHOLDERS[category]}
        onChange={setSearchText}
      />
      <SortFilter />
      <ModpackGrid modpacks={placeholderModpacks} emptySlots={4} />
    </div>
  )
}
