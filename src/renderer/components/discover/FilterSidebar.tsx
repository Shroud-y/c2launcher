import { useEffect, useState } from 'react'
import CategoryIcon from './CategoryIcons'
import { useDiscoverStore } from '../../store/discoverStore'
import type { ContentCategory, ModLoader } from '@shared/types'
import styles from './FilterSidebar.module.css'

interface CategoryTag {
  name: string
  slug: string
}

/**
 * Real Modrinth category slugs per project type (GET /tag/category).
 * Datapacks are mods on Modrinth, so they share the mod categories.
 */
const MOD_CATEGORIES: CategoryTag[] = [
  { name: 'Adventure', slug: 'adventure' },
  { name: 'Cursed', slug: 'cursed' },
  { name: 'Decoration', slug: 'decoration' },
  { name: 'Economy', slug: 'economy' },
  { name: 'Equipment', slug: 'equipment' },
  { name: 'Food', slug: 'food' },
  { name: 'Game Mechanics', slug: 'game-mechanics' },
  { name: 'Library', slug: 'library' },
  { name: 'Magic', slug: 'magic' },
  { name: 'Management', slug: 'management' },
  { name: 'Minigame', slug: 'minigame' },
  { name: 'Mobs', slug: 'mobs' },
  { name: 'Optimization', slug: 'optimization' },
  { name: 'Social', slug: 'social' },
  { name: 'Storage', slug: 'storage' },
  { name: 'Technology', slug: 'technology' },
  { name: 'Transportation', slug: 'transportation' },
  { name: 'Utility', slug: 'utility' },
  { name: 'World Generation', slug: 'worldgen' }
]

const CATEGORIES: Record<ContentCategory, CategoryTag[]> = {
  modpacks: [
    { name: 'Adventure', slug: 'adventure' },
    { name: 'Challenging', slug: 'challenging' },
    { name: 'Combat', slug: 'combat' },
    { name: 'Kitchen Sink', slug: 'kitchen-sink' },
    { name: 'Lightweight', slug: 'lightweight' },
    { name: 'Magic', slug: 'magic' },
    { name: 'Multiplayer', slug: 'multiplayer' },
    { name: 'Optimization', slug: 'optimization' },
    { name: 'Quests', slug: 'quests' },
    { name: 'Technology', slug: 'technology' }
  ],
  mods: MOD_CATEGORIES,
  datapacks: MOD_CATEGORIES,
  resourcepacks: [
    { name: 'Combat', slug: 'combat' },
    { name: 'Cursed', slug: 'cursed' },
    { name: 'Decoration', slug: 'decoration' },
    { name: 'Modded', slug: 'modded' },
    { name: 'Realistic', slug: 'realistic' },
    { name: 'Simplistic', slug: 'simplistic' },
    { name: 'Themed', slug: 'themed' },
    { name: 'Tweaks', slug: 'tweaks' },
    { name: 'Utility', slug: 'utility' },
    { name: 'Vanilla-like', slug: 'vanilla-like' }
  ],
  shaders: [
    { name: 'Cartoon', slug: 'cartoon' },
    { name: 'Cursed', slug: 'cursed' },
    { name: 'Fantasy', slug: 'fantasy' },
    { name: 'Realistic', slug: 'realistic' },
    { name: 'Semi-realistic', slug: 'semi-realistic' },
    { name: 'Vanilla-like', slug: 'vanilla-like' }
  ]
}

const LOADERS: { label: string; value: ModLoader }[] = [
  { label: 'Fabric', value: 'fabric' },
  { label: 'Forge', value: 'forge' },
  { label: 'Quilt', value: 'quilt' },
  { label: 'NeoForge', value: 'neoforge' }
]

export default function FilterSidebar(): JSX.Element {
  const category = useDiscoverStore((s) => s.category)
  const tags = useDiscoverStore((s) => s.tags)
  const gameVersion = useDiscoverStore((s) => s.gameVersion)
  const loader = useDiscoverStore((s) => s.loader)
  const toggleTag = useDiscoverStore((s) => s.toggleTag)
  const setGameVersion = useDiscoverStore((s) => s.setGameVersion)
  const setLoader = useDiscoverStore((s) => s.setLoader)

  const [versions, setVersions] = useState<string[]>([])

  useEffect(() => {
    window.api.minecraft
      .versions()
      .then(setVersions)
      .catch(() => {
        // Offline — the version dropdown just stays empty.
      })
  }, [])

  return (
    <div className={styles.sidebar}>
      <section className={styles.categorySection}>
        <h3 className={styles.heading}>Category</h3>
        <ul className={styles.categoryList}>
          {CATEGORIES[category].map((cat) => {
            const active = tags.includes(cat.slug)
            return (
              <li key={cat.slug}>
                <button
                  type="button"
                  className={active ? styles.categoryItemActive : styles.categoryItem}
                  onClick={() => toggleTag(cat.slug)}
                >
                  <CategoryIcon slug={cat.slug} size={14} className={styles.categoryIcon} />
                  <span>{cat.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className={styles.dropdownSection}>
        <label className={styles.dropdownField}>
          <span className={styles.heading}>Game version</span>
          <select
            className={styles.dropdown}
            value={gameVersion ?? ''}
            onChange={(e) => setGameVersion(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">All versions</option>
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.dropdownField}>
          <span className={styles.heading}>Loader</span>
          <select
            className={styles.dropdown}
            value={loader ?? ''}
            onChange={(e) =>
              setLoader(e.target.value === '' ? null : (e.target.value as ModLoader))
            }
          >
            <option value="">All loaders</option>
            {LOADERS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  )
}
