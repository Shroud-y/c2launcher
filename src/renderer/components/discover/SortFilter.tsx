import { ChevronDownIcon } from '../common/Icons'
import { useDiscoverStore } from '../../store/discoverStore'
import type { SearchQuery } from '@shared/types'
import styles from './SortFilter.module.css'

const SORT_LABELS: Record<SearchQuery['sort'], string> = {
  relevance: 'Relevance',
  downloads: 'Downloads',
  newest: 'Newest',
  updated: 'Updated'
}

const PAGE_SIZES = [10, 20, 50]

/** Page strip like `1 · … · 41 · 42 · 43 · … · 512`. */
function pageList(current: number, last: number): (number | '…')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const wanted = [1, current - 1, current, current + 1, last]
    .filter((p) => p >= 1 && p <= last)
    .sort((a, b) => a - b)
  const out: (number | '…')[] = []
  let prev = 0
  for (const p of wanted) {
    if (p === prev) continue
    if (p > prev + 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

export default function SortFilter(): JSX.Element {
  const sort = useDiscoverStore((s) => s.sort)
  const pageSize = useDiscoverStore((s) => s.pageSize)
  const page = useDiscoverStore((s) => s.page)
  const totalHits = useDiscoverStore((s) => s.totalHits)
  const setSort = useDiscoverStore((s) => s.setSort)
  const setPageSize = useDiscoverStore((s) => s.setPageSize)
  const setPage = useDiscoverStore((s) => s.setPage)

  const lastPage = Math.max(1, Math.ceil(totalHits / pageSize))

  return (
    <div className={styles.row}>
      <label className={styles.dropdown}>
        Sort by: <strong>{SORT_LABELS[sort]}</strong>
        <ChevronDownIcon />
        <select
          className={styles.select}
          value={sort}
          onChange={(e) => setSort(e.target.value as SearchQuery['sort'])}
          aria-label="Sort by"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.dropdown}>
        View: <strong>{pageSize}</strong>
        <ChevronDownIcon />
        <select
          className={styles.select}
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Results per page"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.pagination}>
        {pageList(page, lastPage).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className={styles.ellipsis}>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={p === page ? styles.pageActive : styles.page}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          )
        )}
      </div>
    </div>
  )
}
