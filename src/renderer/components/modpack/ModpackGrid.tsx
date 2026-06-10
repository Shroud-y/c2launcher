import ModpackCard, { EmptyCard } from './ModpackCard'
import type { Modpack } from '@shared/types'
import styles from './ModpackGrid.module.css'

interface ModpackGridProps {
  modpacks: Modpack[]
  emptySlots?: number
}

export default function ModpackGrid({ modpacks, emptySlots = 0 }: ModpackGridProps): JSX.Element {
  return (
    <div className={styles.grid}>
      {modpacks.map((pack) => (
        <ModpackCard key={pack.id} modpack={pack} />
      ))}
      {Array.from({ length: emptySlots }, (_, i) => (
        <EmptyCard key={`empty-${i}`} />
      ))}
    </div>
  )
}
