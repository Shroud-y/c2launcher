import { useEffect, useState } from 'react'
import { CloseIcon } from '../common/Icons'
import { useModalStore } from '../../store/modalStore'
import styles from './SettingsModal.module.css'

export default function SettingsModal(): JSX.Element {
  const closeSettings = useModalStore((s) => s.closeSettings)

  const [dataDir, setDataDir] = useState<string | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((s) => setDataDir(s.dataDir))
  }, [])

  return (
    <div className={styles.overlay} onClick={closeSettings}>
      <div
        className={styles.modal}
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={closeSettings}>
          <CloseIcon />
        </button>
        <h2 className={styles.title}>Settings</h2>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Data folder</span>
          <span className={styles.hint}>
            Where modpack instances, game files and launcher config live.
          </span>
          <code className={styles.path}>{dataDir ?? '…'}</code>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void window.api.settings.openDataDir()}
            >
              Open folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
