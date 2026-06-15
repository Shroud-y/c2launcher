import ModpackCard, { EmptyCard } from './ModpackCard'
import type { IconTint, Modpack } from '@shared/types'
import styles from './ModpackGrid.module.css'

interface ModpackGridProps {
  modpacks: Modpack[]
  emptySlots?: number
}

// Tint derived from grid position so colors stay consistent (and recompute
// when an instance is deleted) instead of sticking to a stored value.
const TINT_CYCLE: IconTint[] = ['teal', 'mint', 'light']

export default function ModpackGrid({ modpacks, emptySlots = 0 }: ModpackGridProps): JSX.Element {
  return (
    <div className={styles.grid}>
      {modpacks.map((pack, i) => (
        <ModpackCard
          key={pack.id}
          modpack={pack}
          tint={TINT_CYCLE[Math.floor(i / 2) % TINT_CYCLE.length]}
        />
      ))}
      {Array.from({ length: emptySlots }, (_, i) => (
        <EmptyCard key={`empty-${i}`} />
      ))}
    </div>
  )
}
