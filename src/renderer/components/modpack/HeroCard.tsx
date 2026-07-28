import { useNavigate } from 'react-router-dom'
import LoaderIcon from '../common/LoaderIcons'
import { CompassIcon, PlayIcon, PlusIcon, StopIcon, WindIcon } from '../common/Icons'
import { formatRelativeTime, formatSubtitle } from '../../data/format'
import { useDiscoverStore } from '../../store/discoverStore'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import type { IconTint, Modpack } from '@shared/types'
import styles from './HeroCard.module.css'

const TINT_CLASS: Record<IconTint, string> = {
  teal: styles.tintTeal,
  mint: styles.tintMint,
  light: styles.tintLight
}

interface HeroCardProps {
  modpack: Modpack
}

/**
 * The headline instance on Home — the one the user played last (or the newest,
 * if nothing has been played yet). Exists so the common case, "open the
 * launcher and keep playing", is one click instead of a trip through the
 * instance modal.
 */
export default function HeroCard({ modpack }: HeroCardProps): JSX.Element {
  const openModpack = useModalStore((s) => s.openModpack)
  const progress = useModpackStore((s) => s.installProgress[modpack.id])
  const gameState = useModpackStore((s) => s.gameStates[modpack.id])
  const launch = useModpackStore((s) => s.launch)
  const stop = useModpackStore((s) => s.stop)

  const isRunning = gameState === 'running' || gameState === 'launching'
  const isInstalling = progress !== undefined

  const subtitle = formatSubtitle(modpack)
  const played =
    modpack.lastPlayedAt !== null ? formatRelativeTime(modpack.lastPlayedAt) : 'Never played'
  const icon = modpack.icon ?? null

  return (
    <section className={styles.hero}>
      {/* The pack's own icon, blown up and blurred, as the backdrop. Packs
          without a custom icon fall back to an accent wash rather than a
          blurred default glyph, which would just be a grey smudge. */}
      <div
        className={icon !== null ? styles.backdrop : styles.backdropFallback}
        style={icon !== null ? { backgroundImage: `url(${icon})` } : undefined}
        aria-hidden="true"
      />

      <button
        type="button"
        className={styles.body}
        onClick={() => openModpack(modpack.id)}
        aria-label={`Open ${modpack.name}`}
      >
        <span className={`${styles.icon} ${TINT_CLASS[modpack.iconTint]}`}>
          {icon !== null ? (
            <img className={styles.iconImage} src={icon} alt="" />
          ) : (
            <WindIcon size={44} />
          )}
        </span>
        <span className={styles.text}>
          <span className={styles.name}>{modpack.name}</span>
          <span className={styles.meta}>
            {modpack.loader !== null && <LoaderIcon loader={modpack.loader} size={16} />}
            {subtitle !== null && <span>{subtitle}</span>}
            {subtitle !== null && <span className={styles.dot}>·</span>}
            <span>{isRunning ? 'Running now' : played}</span>
          </span>
        </span>
      </button>

      <div className={styles.actions}>
        {isRunning ? (
          <button type="button" className={styles.stopButton} onClick={() => void stop(modpack.id)}>
            <StopIcon />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className={styles.playButton}
            disabled={isInstalling}
            onClick={() => void launch(modpack.id)}
          >
            {isInstalling ? (
              `${progress.percent}%`
            ) : (
              <>
                <PlayIcon />
                Play
              </>
            )}
          </button>
        )}
        {/* The card body opens this too, but a labelled button is the
            discoverable way in — mods, settings and logs all live there. */}
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => openModpack(modpack.id)}
        >
          Manage
        </button>
      </div>
    </section>
  )
}

/**
 * Stand-in for the hero when there are no instances at all. Without it a fresh
 * install lands on a blank page — the old layout papered over that with rows of
 * placeholder cards.
 */
export function WelcomeHero(): JSX.Element {
  const navigate = useNavigate()
  const openCreate = useModalStore((s) => s.openCreate)
  const setInstallTarget = useDiscoverStore((s) => s.setInstallTarget)

  return (
    <section className={styles.hero}>
      <div className={styles.backdropFallback} aria-hidden="true" />
      <div className={styles.body}>
        <span className={`${styles.icon} ${styles.tintTeal}`}>
          <WindIcon size={44} />
        </span>
        <span className={styles.text}>
          <span className={styles.name}>No instances yet</span>
          <span className={styles.meta}>
            <span>Create one from scratch, or install a modpack from Modrinth.</span>
          </span>
        </span>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.playButton} onClick={openCreate}>
          <PlusIcon size={18} />
          Create
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            // Same reset the sidebar does: arriving at Discover this way is a
            // fresh browse, not an install into some previously picked instance.
            setInstallTarget(null)
            navigate('/discover')
          }}
        >
          <CompassIcon size={18} />
          Discover
        </button>
      </div>
    </section>
  )
}
