import { useState } from 'react'
import { CloseIcon, WindIcon } from '../common/Icons'
import { useModpackStore } from '../../store/modpackStore'
import type { IconTint, Modpack, ModpackGroup } from '@shared/types'
import cardStyles from './ModpackCard.module.css'
import styles from './ModpackGroup.module.css'

const TINT_CLASS = {
  teal: cardStyles.tintTeal,
  mint: cardStyles.tintMint,
  light: cardStyles.tintLight
} as const

interface GroupTileProps {
  group: ModpackGroup
  members: Modpack[]
  tint: IconTint
  open: boolean
  selected: boolean
  dropTarget: boolean
  onToggleOpen: () => void
  onModifierClick: (e: React.MouseEvent) => void
  dropProps: React.HTMLAttributes<HTMLButtonElement>
}

/** A folder on the grid: one cell, a 2×2 collage of its first members' icons. */
export function GroupTile({
  group,
  members,
  tint,
  open,
  selected,
  dropTarget,
  onToggleOpen,
  onModifierClick,
  dropProps
}: GroupTileProps): JSX.Element {
  const gameStates = useModpackStore((s) => s.gameStates)
  const anyRunning = members.some((m) => {
    const state = gameStates[m.id]
    return state === 'running' || state === 'launching'
  })

  return (
    <button
      type="button"
      className={[
        cardStyles.card,
        open && styles.tileOpen,
        selected && cardStyles.selected,
        dropTarget && cardStyles.dropTarget
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) onModifierClick(e)
        else onToggleOpen()
      }}
      aria-expanded={open}
      {...dropProps}
    >
      {anyRunning && <span className={cardStyles.runningDot} aria-hidden="true" />}
      <span className={`${cardStyles.icon} ${TINT_CLASS[tint]} ${styles.collage}`}>
        {members.slice(0, 4).map((m) => (
          <span key={m.id} className={styles.mini}>
            {(m.icon ?? null) !== null ? (
              <img className={styles.miniImage} src={m.icon ?? ''} alt="" />
            ) : (
              <WindIcon size={14} />
            )}
          </span>
        ))}
      </span>
      <span className={cardStyles.text}>
        <span className={cardStyles.name}>{group.name}</span>
        <span className={cardStyles.subtitle}>{members.length} instances</span>
      </span>
    </button>
  )
}

interface GroupPanelProps {
  group: ModpackGroup
  dropTarget: boolean
  onRename: (name: string) => void
  onDissolve: () => void
  onClose: () => void
  dropProps: React.HTMLAttributes<HTMLDivElement>
  children: React.ReactNode
}

/**
 * The opened group: a full-width row under the tile's row holding the member
 * cards. Dropping a member back onto the main grid takes it out of the group.
 */
export function GroupPanel({
  group,
  dropTarget,
  onRename,
  onDissolve,
  onClose,
  dropProps,
  children
}: GroupPanelProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(group.name)

  const commit = (): void => {
    setEditing(false)
    const name = draft.trim()
    if (name !== '' && name !== group.name) onRename(name)
  }

  return (
    <div className={`${styles.panel} ${dropTarget ? styles.panelDrop : ''}`} {...dropProps}>
      <div className={styles.panelHead}>
        {editing ? (
          <input
            className={styles.nameInput}
            value={draft}
            autoFocus
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                // Keep Home's Esc (clear selection) out of a rename cancel.
                e.stopPropagation()
                setEditing(false)
              }
            }}
          />
        ) : (
          <span
            className={styles.panelName}
            title="Double-click to rename"
            onDoubleClick={() => {
              setDraft(group.name)
              setEditing(true)
            }}
          >
            {group.name}
          </span>
        )}
        <span className={styles.hint}>Drag an instance out to remove it</span>
        <span className={styles.spacer} />
        <button type="button" className={styles.textButton} onClick={onDissolve}>
          Ungroup
        </button>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close group">
          <CloseIcon size={16} />
        </button>
      </div>
      {children}
    </div>
  )
}
