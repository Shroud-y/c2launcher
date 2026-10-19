import { WindIcon } from '../common/Icons'
import { formatSubtitle } from '../../data/format'
import { useModalStore } from '../../store/modalStore'
import { useModpackStore } from '../../store/modpackStore'
import type { IconTint, Modpack } from '@shared/types'
import styles from './ModpackCard.module.css'

const TINT_CLASS = {
  teal: styles.tintTeal,
  mint: styles.tintMint,
  light: styles.tintLight
} as const

interface ModpackCardProps {
  modpack: Modpack
  /** Tint resolved from grid position; falls back to the pack's stored tint. */
  tint?: IconTint
  selected?: boolean
  /** Highlighted as the drop target of a drag in progress. */
  dropTarget?: boolean
  /** Ctrl/Shift+click; when given, such clicks select instead of opening. */
  onModifierClick?: (e: React.MouseEvent) => void
  /** Drag & drop handlers (grouping); the card is draggable when given. */
  dragProps?: React.HTMLAttributes<HTMLButtonElement>
}

export default function ModpackCard({
  modpack,
  tint = modpack.iconTint,
  selected = false,
  dropTarget = false,
  onModifierClick,
  dragProps
}: ModpackCardProps): JSX.Element {
  const openModpack = useModalStore((s) => s.openModpack)
  const progress = useModpackStore((s) => s.installProgress[modpack.id])
  const gameState = useModpackStore((s) => s.gameStates[modpack.id])

  const isRunning = gameState === 'running' || gameState === 'launching'
  const isInstalling = progress !== undefined
  const subtitle =
    isInstalling
      ? `Installing… ${progress.message} (${progress.percent}%)`
      : isRunning
        ? 'Running'
        : formatSubtitle(modpack)

  return (
    <button
      type="button"
      className={[styles.card, selected && styles.selected, dropTarget && styles.dropTarget]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        if (isInstalling) return
        if (onModifierClick !== undefined && (e.ctrlKey || e.metaKey || e.shiftKey)) {
          onModifierClick(e)
          return
        }
        openModpack(modpack.id)
      }}
      draggable={dragProps !== undefined && !isInstalling}
      {...dragProps}
      disabled={isInstalling}
      aria-disabled={isInstalling}
      aria-pressed={onModifierClick !== undefined ? selected : undefined}
    >
      {isRunning && <span className={styles.runningDot} aria-hidden="true" />}
      <span className={`${styles.icon} ${TINT_CLASS[tint]}`}>
        {(modpack.icon ?? null) !== null ? (
          <img className={styles.iconImage} src={modpack.icon ?? ''} alt="" />
        ) : (
          <WindIcon size={28} />
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{modpack.name}</span>
        {subtitle !== null && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
    </button>
  )
}

export function EmptyCard(): JSX.Element {
  return <div className={styles.emptyCard} aria-hidden="true" />
}
