import { useEffect, useState } from 'react'
import { CompassIcon, GridIcon, TrendUpIcon } from '../common/Icons'
import { useDiscoverStore } from '../../store/discoverStore'
import type { ModLoader } from '@shared/types'
import styles from './FilterSidebar.module.css'

/** Mockup category list mapped to Modrinth category slugs. */
const CATEGORIES: { name: string; slug: string; trending: boolean }[] = [
  { name: 'Adventure', slug: 'adventure', trending: false },
  { name: 'Challenging', slug: 'challenging', trending: true },
  { name: 'Combat', slug: 'combat', trending: false },
  { name: 'Kitchen Sink', slug: 'kitchen-sink', trending: false },
  { name: 'Lightweight', slug: 'lightweight', trending: false },
  { name: 'Magic', slug: 'magic', trending: true },
  { name: 'Multiplayer', slug: 'multiplayer', trending: true }
]

const LOADERS: { label: string; value: ModLoader }[] = [
  { label: 'Fabric', value: 'fabric' },
  { label: 'Forge', value: 'forge' },
  { label: 'Quilt', value: 'quilt' },
  { label: 'NeoForge', value: 'neoforge' }
]

export default function FilterSidebar(): JSX.Element {
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
      <section>
        <h3 className={styles.heading}>Category</h3>
        <ul className={styles.categoryList}>
          {CATEGORIES.map((cat) => {
            const active = tags.includes(cat.slug)
            return (
              <li key={cat.slug}>
                <button
                  type="button"
                  className={active ? styles.categoryItemActive : styles.categoryItem}
                  onClick={() => toggleTag(cat.slug)}
                >
                  {cat.slug === 'adventure' ? (
                    <CompassIcon size={14} className={styles.categoryIcon} />
                  ) : (
                    <GridIcon size={14} className={styles.categoryIcon} />
                  )}
                  <span>{cat.name}</span>
                  {cat.trending && <TrendUpIcon className={styles.trend} />}
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
