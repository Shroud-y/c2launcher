import { useEffect, useState } from 'react'
import { CloseIcon } from '../common/Icons'
import { useModalStore } from '../../store/modalStore'
import styles from './SettingsModal.module.css'

export default function SettingsModal(): JSX.Element {
  const closeSettings = useModalStore((s) => s.closeSettings)

  const [dataDir, setDataDir] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((s) => setDataDir(s.dataDir))
  }, [])

  async function changeDataDir(): Promise<void> {
    setMoving(true)
    setError(null)
    try {
      const settings = await window.api.settings.chooseDataDir()
      setDataDir(settings.dataDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to move data folder'
      setError(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    } finally {
      setMoving(false)
    }
  }

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
            Where modpack instances and game files live. Moving it transfers existing data.
          </span>
          <code className={styles.path}>{moving ? 'Moving…' : (dataDir ?? '…')}</code>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={moving}
              onClick={() => void changeDataDir()}
            >
              Change…
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={moving}
              onClick={() => void window.api.settings.openDataDir()}
            >
              Open folder
            </button>
          </div>
          {error !== null && <span className={styles.error}>{error}</span>}
        </div>
      </div>
    </div>
  )
}
