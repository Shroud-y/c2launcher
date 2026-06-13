import ModpackGrid from '../components/modpack/ModpackGrid'
import { GridIcon } from '../components/common/Icons'
import { useModpackStore } from '../store/modpackStore'
import styles from './Home.module.css'

const MIN_SLOTS = 10

export default function Home(): JSX.Element {
  const modpacks = useModpackStore((s) => s.modpacks)
  const emptySlots = Math.max(0, MIN_SLOTS - modpacks.length)

  return (
    <div className={styles.page}>
      <div className={styles.headingWrap}>
        <div className={styles.headingPill}>
          <GridIcon size={40} />
          <span>Your modpacks</span>
        </div>
      </div>
      <div className={styles.divider} />
      <ModpackGrid modpacks={modpacks} emptySlots={emptySlots} />
    </div>
  )
}
