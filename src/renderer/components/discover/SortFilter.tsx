import { ChevronDownIcon } from '../common/Icons'
import styles from './SortFilter.module.css'

const PAGES: (number | '…')[] = [1, 2, '…', 512]

export default function SortFilter(): JSX.Element {
  return (
    <div className={styles.row}>
      <button type="button" className={styles.dropdown}>
        Sort by: <strong>Relevance</strong>
        <ChevronDownIcon />
      </button>
      <button type="button" className={styles.dropdown}>
        View: <strong>20</strong>
        <ChevronDownIcon />
      </button>

      <div className={styles.pagination}>
        {PAGES.map((page, i) =>
          page === '…' ? (
            <span key={`gap-${i}`} className={styles.ellipsis}>
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              className={page === 1 ? styles.pageActive : styles.page}
            >
              {page}
            </button>
          )
        )}
      </div>
    </div>
  )
}
