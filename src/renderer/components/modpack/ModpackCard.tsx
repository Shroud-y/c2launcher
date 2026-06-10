import { WindIcon } from '../common/Icons'
import { formatSubtitle } from '../../data/placeholders'
import { useModalStore } from '../../store/modalStore'
import type { Modpack } from '@shared/types'
import styles from './ModpackCard.module.css'

const TINT_CLASS = {
  teal: styles.tintTeal,
  mint: styles.tintMint,
  light: styles.tintLight
} as const

interface ModpackCardProps {
  modpack: Modpack
}

export default function ModpackCard({ modpack }: ModpackCardProps): JSX.Element {
  const openModpack = useModalStore((s) => s.openModpack)
  const subtitle = formatSubtitle(modpack)

  return (
    <button type="button" className={styles.card} onClick={() => openModpack(modpack.id)}>
      <span className={`${styles.icon} ${TINT_CLASS[modpack.iconTint]}`}>
        <WindIcon size={28} />
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
