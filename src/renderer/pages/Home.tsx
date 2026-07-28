import { useEffect, useMemo, useRef, useState } from 'react'
import ModpackGrid from '../components/modpack/ModpackGrid'
import HeroCard, { WelcomeHero } from '../components/modpack/HeroCard'
import { useModpackStore } from '../store/modpackStore'
import type { Modpack } from '@shared/types'
import styles from './Home.module.css'

const COLS = 2
const MIN_ROWS = 5
const ROW_HEIGHT = 96 // EmptyCard height
const GAP = 12 // grid gap
const BOTTOM_PAD = 24 // .content bottom padding

/**
 * The instance the hero shows: the one played most recently, falling back to
 * the newest when nothing has been played yet (a fresh import, say). Null only
 * when there are no instances at all.
 */
function pickFeatured(modpacks: Modpack[]): Modpack | null {
  if (modpacks.length === 0) return null
  const played = modpacks.filter((m) => m.lastPlayedAt !== null)
  const pool = played.length > 0 ? played : modpacks
  const key = (m: Modpack): number => m.lastPlayedAt ?? m.createdAt
  return pool.reduce((best, m) => (key(m) > key(best) ? m : best))
}

export default function Home(): JSX.Element {
  const modpacks = useModpackStore((s) => s.modpacks)
  const featured = useMemo(() => pickFeatured(modpacks), [modpacks])
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
      {featured !== null ? <HeroCard modpack={featured} /> : <WelcomeHero />}

      {/* The featured pack is deliberately repeated in the grid below: dropping
          it would reshuffle every tile each time a different pack is played. */}
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>Instances</span>
        <span className={styles.count}>{modpacks.length}</span>
        <span className={styles.rule} />
      </div>

      <div ref={gridRef}>
        <ModpackGrid modpacks={modpacks} emptySlots={emptySlots} />
      </div>
    </div>
  )
}
