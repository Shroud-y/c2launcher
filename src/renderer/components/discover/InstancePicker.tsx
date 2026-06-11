import { CloseIcon, WindIcon } from '../common/Icons'
import type { Modpack } from '@shared/types'
import styles from './InstancePicker.module.css'

/**
 * Centered popup listing local instances to install content into.
 * Replaces the old inline <select> so all instances are visible at once.
 */

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function subtitle(pack: Modpack): string {
  const parts: string[] = []
  if (pack.loader !== null) parts.push(capitalize(pack.loader))
  if (pack.gameVersion !== null) parts.push(pack.gameVersion)
  return parts.join(' ')
}

interface InstancePickerProps {
  title: string
  targets: Modpack[]
  emptyMessage: string
  onPick: (modpackId: string) => void
  onClose: () => void
}

export default function InstancePicker({
  title,
  targets,
  emptyMessage,
  onPick,
  onClose
}: InstancePickerProps): JSX.Element {
  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button type="button" className={styles.closeButton} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        {targets.length === 0 ? (
          <p className={styles.empty}>{emptyMessage}</p>
        ) : (
          <ul className={styles.list}>
            {targets.map((pack) => (
              <li key={pack.id}>
                <button type="button" className={styles.instance} onClick={() => onPick(pack.id)}>
                  <span className={styles.instanceIcon}>
                    {(pack.icon ?? null) !== null ? (
                      <img className={styles.instanceIconImage} src={pack.icon ?? ''} alt="" />
                    ) : (
                      <WindIcon size={20} />
                    )}
                  </span>
                  <span className={styles.instanceText}>
                    <span className={styles.instanceName}>{pack.name}</span>
                    {subtitle(pack) !== '' && (
                      <span className={styles.instanceMeta}>{subtitle(pack)}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
