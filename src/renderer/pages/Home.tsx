import ModpackGrid from '../components/modpack/ModpackGrid'
import { GridIcon } from '../components/common/Icons'
import { emptySlotCount, placeholderModpacks } from '../data/placeholders'
import styles from './Home.module.css'

export default function Home(): JSX.Element {
  return (
    <div className={styles.page}>
      <div className={styles.headingWrap}>
        <div className={styles.headingPill}>
          <GridIcon />
          <span>Your modpacks</span>
        </div>
      </div>
      <div className={styles.divider} />
      <ModpackGrid modpacks={placeholderModpacks} emptySlots={emptySlotCount} />
    </div>
  )
}
