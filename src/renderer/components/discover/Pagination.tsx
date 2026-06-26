import { useState } from 'react'
import { useDiscoverStore } from '../../store/discoverStore'
import styles from './Pagination.module.css'

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

export default function Pagination(): JSX.Element {
  const pageSize = useDiscoverStore((s) => s.pageSize)
  const page = useDiscoverStore((s) => s.page)
  const totalHits = useDiscoverStore((s) => s.totalHits)
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
  )
}
