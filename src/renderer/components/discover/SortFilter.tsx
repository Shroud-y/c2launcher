import { useState } from 'react'
import Dropdown from '../common/Dropdown'
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

  // Index of the `…` currently being edited as a jump-to-page input.
  const [jumpAt, setJumpAt] = useState<number | null>(null)
  const [jumpValue, setJumpValue] = useState('')

  function commitJump(): void {
    const n = Number(jumpValue)
    if (Number.isInteger(n) && n >= 1 && n <= lastPage) setPage(n)
    setJumpAt(null)
    setJumpValue('')
  }

  return (
    <div className={styles.row}>
      <Dropdown
        pill
        ariaLabel="Sort by"
        prefix="Sort by:"
        value={sort}
        onChange={(v) => setSort(v as SearchQuery['sort'])}
        options={Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label }))}
      />

      <Dropdown
        pill
        ariaLabel="Results per page"
        prefix="View:"
        value={String(pageSize)}
        onChange={(v) => setPageSize(Number(v))}
        options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
      />

      <div className={styles.pagination}>
        {pageList(page, lastPage).map((p, i) =>
          p === '…' ? (
            jumpAt === i ? (
              <input
                key={`gap-${i}`}
                type="number"
                min={1}
                max={lastPage}
                autoFocus
                className={styles.jumpInput}
                value={jumpValue}
                placeholder="#"
                aria-label="Go to page"
                onChange={(e) => setJumpValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitJump()
                  else if (e.key === 'Escape') {
                    setJumpAt(null)
                    setJumpValue('')
                  }
                }}
                onBlur={commitJump}
              />
            ) : (
              <button
                key={`gap-${i}`}
                type="button"
                className={styles.ellipsis}
                title="Go to page…"
                onClick={() => {
                  setJumpValue('')
                  setJumpAt(i)
                }}
              >
                …
              </button>
            )
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
