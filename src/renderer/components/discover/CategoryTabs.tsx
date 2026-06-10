import type { ContentCategory } from '@shared/types'
import styles from './CategoryTabs.module.css'

const TABS: { id: ContentCategory; label: string }[] = [
  { id: 'modpacks', label: 'Modpacks' },
  { id: 'mods', label: 'Mods' },
  { id: 'resourcepacks', label: 'Resource packs' },
  { id: 'datapacks', label: 'Data packs' },
  { id: 'shaders', label: 'Shaders' }
]

interface CategoryTabsProps {
  active: ContentCategory
  onChange: (category: ContentCategory) => void
}

export default function CategoryTabs({ active, onChange }: CategoryTabsProps): JSX.Element {
  return (
    <div className={styles.container}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === active ? styles.tabActive : styles.tab}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
