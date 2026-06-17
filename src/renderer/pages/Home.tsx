import { useEffect, useRef, useState } from 'react'
import ModpackGrid from '../components/modpack/ModpackGrid'
import { GridIcon } from '../components/common/Icons'
import { useModpackStore } from '../store/modpackStore'
import styles from './Home.module.css'

const COLS = 2
const MIN_ROWS = 5
const ROW_HEIGHT = 96 // EmptyCard height
const GAP = 12 // grid gap
const BOTTOM_PAD = 24 // .content bottom padding

export default function Home(): JSX.Element {
  const modpacks = useModpackStore((s) => s.modpacks)
  const gridRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState(MIN_ROWS)

  // Fill the viewport: derive how many placeholder rows fit below the grid's
  // top so fullscreen doesn't leave a large gap at the bottom.
  useEffect(() => {
    const el = gridRef.current
    const scroller = el?.closest('main') ?? null
    const recompute = (): void => {
      if (!el || !scroller) return
      // Space from the grid's top down to the bottom of the scroll area's
      // content box. Measured off the scroller (not window.innerHeight, which
      // ignores the title bar and lags fullscreen toggles).
      const contentBottom = scroller.getBoundingClientRect().top + scroller.clientHeight
      const avail = contentBottom - el.getBoundingClientRect().top - BOTTOM_PAD
      const fit = Math.round((avail + GAP) / (ROW_HEIGHT + GAP))
      setRows(Math.max(MIN_ROWS, fit))
    }
    recompute()

    // Observe the scroll container so we react to window/fullscreen resizes
    // even when the global 'resize' event doesn't fire reliably.
    const ro = new ResizeObserver(recompute)
    if (scroller) ro.observe(scroller)
    window.addEventListener('resize', recompute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [modpacks.length])

  const emptySlots = Math.max(0, rows * COLS - modpacks.length)

  return (
    <div className={styles.page}>
      <div className={styles.headingWrap}>
        <div className={styles.headingPill}>
          <GridIcon size={40} />
          <span>Your modpacks</span>
        </div>
      </div>
      <div className={styles.divider} />
      <div ref={gridRef}>
        <ModpackGrid modpacks={modpacks} emptySlots={emptySlots} />
      </div>
    </div>
  )
}
