import { CompassIcon, GridIcon, TrendUpIcon } from '../common/Icons'
import styles from './FilterSidebar.module.css'

const CATEGORIES: { name: string; trending: boolean }[] = [
  { name: 'Adventure', trending: false },
  { name: 'Challenging', trending: true },
  { name: 'Combat', trending: false },
  { name: 'Kitchen Sink', trending: false },
  { name: 'Lightweight', trending: false },
  { name: 'Magic', trending: true },
  { name: 'Multiplayer', trending: true }
]

const VERSION_LOADER_ROWS: { version: string; loader: string }[] = [
  { version: '1.21.11', loader: 'Fabric' },
  { version: '1.21.10', loader: 'Forge' },
  { version: '1.21.9', loader: 'Quilt' }
]

export default function FilterSidebar(): JSX.Element {
  return (
    <div className={styles.sidebar}>
      <section>
        <h3 className={styles.heading}>Category</h3>
        <ul className={styles.categoryList}>
          {CATEGORIES.map((cat) => (
            <li key={cat.name}>
              <button type="button" className={styles.categoryItem}>
                {cat.name === 'Adventure' ? (
                  <CompassIcon size={14} className={styles.categoryIcon} />
                ) : (
                  <GridIcon size={14} className={styles.categoryIcon} />
                )}
                <span>{cat.name}</span>
                {cat.trending && <TrendUpIcon className={styles.trend} />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className={styles.tableHeader}>
          <h3 className={styles.heading}>Game version</h3>
          <h3 className={styles.heading}>Loader</h3>
        </div>
        <ul className={styles.versionList}>
          {VERSION_LOADER_ROWS.map((row) => (
            <li key={row.version} className={styles.versionRow}>
              <button type="button" className={styles.link}>
                {row.version}
              </button>
              <button type="button" className={styles.link}>
                {row.loader}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
